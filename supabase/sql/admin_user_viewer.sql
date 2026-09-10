-- Mirror of 20260910140000_admin_user_viewer.sql for SQL Editor use.
-- Prefer applying via migrations.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at
  ON public.profiles (last_active_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.touch_own_last_active()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  next_at timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET last_active_at = now()
  WHERE id = uid
    AND (last_active_at IS NULL OR last_active_at < now() - interval '45 seconds')
  RETURNING last_active_at INTO next_at;

  IF next_at IS NULL THEN
    SELECT last_active_at INTO next_at
    FROM public.profiles
    WHERE id = uid;
  END IF;

  RETURN next_at;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_own_last_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_own_last_active() FROM anon;
GRANT EXECUTE ON FUNCTION public.touch_own_last_active() TO authenticated;

DROP POLICY IF EXISTS rooms_admin_select ON public.rooms;
CREATE POLICY rooms_admin_select ON public.rooms
  FOR SELECT
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS room_items_admin_select ON public.room_items;
CREATE POLICY room_items_admin_select ON public.room_items
  FOR SELECT
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS catalog_select_admin ON public.furniture_catalog;
CREATE POLICY catalog_select_admin ON public.furniture_catalog
  FOR SELECT
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS model_files_select_admin ON storage.objects;
CREATE POLICY model_files_select_admin ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'model-files'
    AND public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS profile_avatars_select_admin ON storage.objects;
CREATE POLICY profile_avatars_select_admin ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS room_thumbnails_select_admin ON storage.objects;
CREATE POLICY room_thumbnails_select_admin ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'room-thumbnails'
    AND public.is_admin((SELECT auth.uid()))
  );

DROP FUNCTION IF EXISTS public.get_admin_user_item_totals();

CREATE OR REPLACE FUNCTION public.get_admin_user_item_totals()
RETURNS TABLE (
  user_id uuid,
  handle text,
  display_name text,
  is_public boolean,
  created_at timestamptz,
  last_active_at timestamptz,
  room_count bigint,
  total_item_placements bigint,
  model_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admins AS a
    WHERE a.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH room_stats AS (
    SELECT
      r.user_id,
      COUNT(DISTINCT r.id)::bigint AS room_count,
      COUNT(ri.id)::bigint AS placements,
      MAX(r.updated_at) AS rooms_updated_at
    FROM public.rooms AS r
    LEFT JOIN public.room_items AS ri ON ri.room_id = r.id
    GROUP BY r.user_id
  ),
  model_stats AS (
    SELECT
      fc.user_id,
      COUNT(*)::bigint AS model_count,
      MAX(fc.created_at) AS models_at
    FROM public.furniture_catalog AS fc
    WHERE fc.is_builtin = false
      AND fc.user_id IS NOT NULL
    GROUP BY fc.user_id
  ),
  job_stats AS (
    SELECT
      j.user_id,
      MAX(j.updated_at) AS jobs_at
    FROM public.conversion_jobs AS j
    GROUP BY j.user_id
  )
  SELECT
    p.id AS user_id,
    p.handle AS handle,
    p.display_name AS display_name,
    p.is_public AS is_public,
    p.created_at AS created_at,
    (
      SELECT MAX(ts)
      FROM (VALUES
        (p.last_active_at),
        (p.created_at),
        (au.last_sign_in_at),
        (rs.rooms_updated_at),
        (ms.models_at),
        (js.jobs_at)
      ) AS activity(ts)
    ) AS last_active_at,
    COALESCE(rs.room_count, 0)::bigint AS room_count,
    COALESCE(rs.placements, 0)::bigint AS total_item_placements,
    COALESCE(ms.model_count, 0)::bigint AS model_count
  FROM public.profiles AS p
  LEFT JOIN auth.users AS au ON au.id = p.id
  LEFT JOIN room_stats AS rs ON rs.user_id = p.id
  LEFT JOIN model_stats AS ms ON ms.user_id = p.id
  LEFT JOIN job_stats AS js ON js.user_id = p.id
  ORDER BY last_active_at DESC NULLS LAST, p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_item_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_user_item_totals() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_user_item_totals() TO authenticated;

DROP FUNCTION IF EXISTS public.get_admin_user_overview(uuid);

CREATE OR REPLACE FUNCTION public.get_admin_user_overview(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'user', jsonb_build_object(
      'user_id', p.id,
      'email', au.email,
      'handle', p.handle,
      'display_name', p.display_name,
      'bio', p.bio,
      'avatar_path', p.avatar_path,
      'is_public', p.is_public,
      'created_at', p.created_at,
      'last_active_at', (
        SELECT MAX(ts)
        FROM (VALUES
          (p.last_active_at),
          (p.created_at),
          (au.last_sign_in_at),
          (rs.rooms_updated_at),
          (ms.models_at),
          (js.jobs_at)
        ) AS activity(ts)
      ),
      'last_sign_in_at', au.last_sign_in_at,
      'plan', 'free'
    ),
    'rooms', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'room_id', r.id,
          'name', r.name,
          'visibility', r.visibility,
          'item_count', COALESCE(ic.cnt, 0),
          'likes_count', COALESCE(r.likes_count, 0),
          'views_count', COALESCE(r.views_count, 0),
          'fork_count', COALESCE(r.fork_count, 0),
          'created_at', r.created_at,
          'updated_at', r.updated_at,
          'quarantined_at', r.quarantined_at,
          'thumbnail_path', r.thumbnail_path
        )
        ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC
      )
      FROM public.rooms AS r
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::bigint AS cnt
        FROM public.room_items AS ri
        WHERE ri.room_id = r.id
      ) AS ic ON true
      WHERE r.user_id = p.id
    ), '[]'::jsonb),
    'models', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'kind', fc.kind,
          'label', fc.label,
          'description', fc.description,
          'tags', COALESCE(fc.tags, '{}'::text[]),
          'categories', COALESCE(fc.categories, '{}'::text[]),
          'visibility', fc.visibility,
          'width_in', fc.width_in,
          'height_in', fc.height_in,
          'depth_in', fc.depth_in,
          'clearance_in', fc.clearance_in,
          'likes_count', COALESCE(fc.likes_count, 0),
          'downloads_count', COALESCE(fc.downloads_count, 0),
          'views_count', COALESCE(fc.views_count, 0),
          'created_at', fc.created_at,
          'model_url', fc.model_url,
          'thumbnail_path', fc.thumbnail_path,
          'quarantined_at', fc.quarantined_at
        )
        ORDER BY fc.created_at DESC NULLS LAST, fc.label ASC
      )
      FROM public.furniture_catalog AS fc
      WHERE fc.user_id = p.id
        AND fc.is_builtin = false
    ), '[]'::jsonb),
    'analytics', jsonb_build_object(
      'generated_at', now(),
      'totals', jsonb_build_object(
        'rooms', COALESCE(rs.room_count, 0),
        'models', COALESCE(ms.model_count, 0),
        'placements', COALESCE(rs.placements, 0),
        'generations', COALESCE(js.job_count, 0),
        'generations_completed', COALESCE(js.completed_count, 0),
        'generations_failed', COALESCE(js.failed_count, 0),
        'public_rooms', COALESCE(rs.public_rooms, 0),
        'public_models', COALESCE(ms.public_models, 0)
      ),
      'series', '[]'::jsonb,
      'extras', '{}'::jsonb
    )
  )
  INTO payload
  FROM public.profiles AS p
  LEFT JOIN auth.users AS au ON au.id = p.id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(DISTINCT r.id)::bigint AS room_count,
      COUNT(ri.id)::bigint AS placements,
      MAX(r.updated_at) AS rooms_updated_at,
      COUNT(DISTINCT r.id) FILTER (WHERE r.visibility = 'public')::bigint AS public_rooms
    FROM public.rooms AS r
    LEFT JOIN public.room_items AS ri ON ri.room_id = r.id
    WHERE r.user_id = p.id
  ) AS rs ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS model_count,
      MAX(fc.created_at) AS models_at,
      COUNT(*) FILTER (WHERE fc.visibility = 'public')::bigint AS public_models
    FROM public.furniture_catalog AS fc
    WHERE fc.user_id = p.id
      AND fc.is_builtin = false
  ) AS ms ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS job_count,
      COUNT(*) FILTER (WHERE j.status = 'completed')::bigint AS completed_count,
      COUNT(*) FILTER (WHERE j.status = 'failed')::bigint AS failed_count,
      MAX(j.updated_at) AS jobs_at
    FROM public.conversion_jobs AS j
    WHERE j.user_id = p.id
  ) AS js ON true
  WHERE p.id = p_user_id;

  RETURN payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_overview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_user_overview(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_user_overview(uuid) TO authenticated;
