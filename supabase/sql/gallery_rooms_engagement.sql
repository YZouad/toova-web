-- Gallery rooms: likes, unique views, browse/home RPCs, and counter protection.
-- fork_count remains the authoritative clone count.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS likes_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

UPDATE public.rooms
SET published_at = coalesce(published_at, updated_at, created_at, now())
WHERE visibility = 'public'
  AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_public_likes
  ON public.rooms (likes_count DESC)
  WHERE visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_rooms_public_views
  ON public.rooms (views_count DESC)
  WHERE visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_rooms_public_forks
  ON public.rooms (fork_count DESC)
  WHERE visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_rooms_public_published
  ON public.rooms (published_at DESC NULLS LAST)
  WHERE visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_rooms_public_updated
  ON public.rooms (updated_at DESC)
  WHERE visibility = 'public';

-- ---------------------------------------------------------------------------
-- 2) Likes + unique views
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_likes (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_room_likes_room
  ON public.room_likes (room_id);

ALTER TABLE public.room_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_likes_owner ON public.room_likes;
CREATE POLICY room_likes_owner ON public.room_likes
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.room_views (
  room_id uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  viewer_key text NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, viewer_key),
  CONSTRAINT room_views_viewer_key_len CHECK (char_length(viewer_key) BETWEEN 8 AND 96)
);

CREATE INDEX IF NOT EXISTS idx_room_views_room
  ON public.room_views (room_id);

ALTER TABLE public.room_views ENABLE ROW LEVEL SECURITY;

-- Inserts only via SECURITY DEFINER RPC.
DROP POLICY IF EXISTS room_views_no_direct ON public.room_views;
CREATE POLICY room_views_no_direct ON public.room_views
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.room_views FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.room_likes TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Protect counters (extend existing trigger)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rooms_protect_fork_and_visibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(nullif(current_setting('app.toova_bypass_room_guards', true), ''), '0') = '1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.forked_from IS NOT NULL THEN
      RAISE EXCEPTION 'forked_from may only be set via fork RPCs'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.fork_count IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'fork_count is read-only'
        USING ERRCODE = '42501';
    END IF;
    IF coalesce(NEW.likes_count, 0) IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'likes_count is read-only'
        USING ERRCODE = '42501';
    END IF;
    IF coalesce(NEW.views_count, 0) IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'views_count is read-only'
        USING ERRCODE = '42501';
    END IF;
    NEW.visibility := 'private';
    NEW.published_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.fork_count IS DISTINCT FROM OLD.fork_count THEN
    RAISE EXCEPTION 'fork_count is read-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.forked_from IS DISTINCT FROM OLD.forked_from THEN
    RAISE EXCEPTION 'forked_from is read-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    RAISE EXCEPTION 'visibility may only be changed via set_room_visibility'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.likes_count IS DISTINCT FROM OLD.likes_count THEN
    RAISE EXCEPTION 'likes_count is read-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.views_count IS DISTINCT FROM OLD.views_count THEN
    RAISE EXCEPTION 'views_count is read-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'published_at is read-only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rooms_protect_fork_and_visibility ON public.rooms;
CREATE TRIGGER rooms_protect_fork_and_visibility
  BEFORE INSERT OR UPDATE OF forked_from, fork_count, visibility, likes_count, views_count, published_at
  ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.rooms_protect_fork_and_visibility();

REVOKE UPDATE ON TABLE public.rooms FROM authenticated;
GRANT UPDATE (
  name,
  sort_order,
  updated_at,
  environment,
  room_geometry,
  thumbnail_path
) ON TABLE public.rooms TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Hot score
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.room_hot_score(
  p_likes bigint,
  p_forks bigint,
  p_views bigint,
  p_published_at timestamptz
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    coalesce(p_likes, 0)::double precision * 4.0
    + coalesce(p_forks, 0)::double precision * 3.0
    + coalesce(p_views, 0)::double precision * 0.1
  ) / power(
    greatest(
      1.0,
      extract(epoch from (now() - coalesce(p_published_at, now()))) / 86400.0 + 2.0
    ),
    1.2
  );
$$;

-- ---------------------------------------------------------------------------
-- 5) set_room_visibility: stamp published_at + require public profile
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_room_visibility(p_room_id uuid, p_visibility text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  profile_public boolean;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF p_visibility NOT IN ('private', 'public') THEN
    RAISE EXCEPTION 'invalid visibility'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_room_owner(p_room_id) THEN
    RAISE EXCEPTION 'not room owner'
      USING ERRCODE = '42501';
  END IF;

  IF p_visibility = 'public' THEN
    SELECT coalesce(p.is_public, false) INTO profile_public
    FROM public.profiles p
    WHERE p.id = uid;

    IF NOT coalesce(profile_public, false) THEN
      RAISE EXCEPTION 'profile must be public to publish a room'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM set_config('app.toova_bypass_room_guards', '1', true);

  UPDATE public.rooms
  SET visibility = p_visibility,
      updated_at = now(),
      published_at = CASE
        WHEN p_visibility = 'public' THEN coalesce(published_at, now())
        ELSE published_at
      END
  WHERE id = p_room_id
    AND user_id = uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_room_visibility(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_room_visibility(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_room_visibility(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Engagement RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_room_like(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  liked boolean;
  cnt bigint;
  target record;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT r.id, r.user_id, r.visibility, p.is_public
  INTO target
  FROM public.rooms r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.id = p_room_id;

  IF target.id IS NULL
     OR target.visibility <> 'public'
     OR target.is_public IS NOT TRUE THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;

  IF target.user_id = uid THEN
    RAISE EXCEPTION 'cannot like own room' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.toova_bypass_room_guards', '1', true);

  IF EXISTS (
    SELECT 1 FROM public.room_likes rl
    WHERE rl.user_id = uid AND rl.room_id = p_room_id
  ) THEN
    DELETE FROM public.room_likes
    WHERE user_id = uid AND room_id = p_room_id;
    liked := false;
  ELSE
    INSERT INTO public.room_likes (user_id, room_id) VALUES (uid, p_room_id);
    liked := true;
  END IF;

  SELECT count(*)::bigint INTO cnt
  FROM public.room_likes
  WHERE room_id = p_room_id;

  UPDATE public.rooms
  SET likes_count = cnt
  WHERE id = p_room_id;

  RETURN jsonb_build_object('liked', liked, 'likes_count', cnt);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_room_view(
  p_room_id uuid,
  p_viewer_token text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  vkey text;
  inserted int := 0;
  new_count bigint;
  target record;
  recent int;
BEGIN
  SELECT r.id, r.visibility, p.is_public
  INTO target
  FROM public.rooms r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.id = p_room_id;

  IF target.id IS NULL
     OR target.visibility <> 'public'
     OR target.is_public IS NOT TRUE THEN
    RETURN 0;
  END IF;

  IF uid IS NOT NULL THEN
    vkey := 'u:' || uid::text;
  ELSE
    IF p_viewer_token IS NULL
       OR char_length(trim(p_viewer_token)) < 8
       OR char_length(trim(p_viewer_token)) > 128 THEN
      RETURN 0;
    END IF;
    vkey := 'a:' || encode(
      extensions.digest(convert_to(trim(p_viewer_token), 'UTF8'), 'sha256'),
      'hex'
    );
  END IF;

  SELECT count(*)::int INTO recent
  FROM public.room_views rv
  WHERE rv.viewer_key = vkey
    AND rv.first_seen > now() - interval '1 hour';

  IF recent >= 60 THEN
    SELECT coalesce(r.views_count, 0)::bigint INTO new_count
    FROM public.rooms r
    WHERE r.id = p_room_id;
    RETURN coalesce(new_count, 0);
  END IF;

  INSERT INTO public.room_views (room_id, viewer_key)
  VALUES (p_room_id, vkey)
  ON CONFLICT (room_id, viewer_key) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;

  IF inserted > 0 THEN
    PERFORM set_config('app.toova_bypass_room_guards', '1', true);
    UPDATE public.rooms
    SET views_count = views_count + 1
    WHERE id = p_room_id
    RETURNING views_count INTO new_count;
    RETURN coalesce(new_count, 0);
  END IF;

  SELECT coalesce(r.views_count, 0)::bigint INTO new_count
  FROM public.rooms r
  WHERE r.id = p_room_id;

  RETURN coalesce(new_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_room_like(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_room_view(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_room_like(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_room_view(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Browse RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_gallery_rooms(
  p_sort text DEFAULT 'hot',
  p_query text DEFAULT NULL,
  p_limit int DEFAULT 48,
  p_offset int DEFAULT 0,
  p_source text DEFAULT 'community'
)
RETURNS TABLE (
  room_id uuid,
  name text,
  thumbnail_path text,
  user_id uuid,
  visibility text,
  likes_count bigint,
  views_count bigint,
  fork_count bigint,
  published_at timestamptz,
  updated_at timestamptz,
  creator_handle text,
  creator_display_name text,
  liked_by_me boolean,
  hot_score double precision,
  room_geometry jsonb,
  preview_items jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  lim int := greatest(1, least(coalesce(p_limit, 48), 100));
  off int := greatest(0, coalesce(p_offset, 0));
  srt text := lower(coalesce(p_sort, 'hot'));
  src text := lower(coalesce(p_source, 'community'));
  q text := nullif(lower(trim(coalesce(p_query, ''))), '');
  uid uuid := (SELECT auth.uid());
BEGIN
  IF src NOT IN ('community', 'mine') THEN
    RAISE EXCEPTION 'invalid source' USING ERRCODE = '22023';
  END IF;
  IF src = 'mine' AND uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF srt NOT IN ('hot', 'likes', 'views', 'clones', 'newest') THEN
    RAISE EXCEPTION 'invalid sort' USING ERRCODE = '22023';
  END IF;
  IF src = 'mine' THEN
    srt := 'newest';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      r.id AS room_id,
      r.name,
      NULLIF(trim(r.thumbnail_path), '') AS thumbnail_path,
      r.user_id,
      r.visibility,
      coalesce(r.likes_count, 0)::bigint AS likes_count,
      coalesce(r.views_count, 0)::bigint AS views_count,
      coalesce(r.fork_count, 0)::bigint AS fork_count,
      coalesce(r.published_at, r.updated_at, r.created_at) AS published_at,
      r.updated_at,
      p.handle AS creator_handle,
      p.display_name AS creator_display_name,
      EXISTS (
        SELECT 1 FROM public.room_likes rl
        WHERE rl.user_id = uid AND rl.room_id = r.id
      ) AS liked_by_me,
      public.room_hot_score(
        coalesce(r.likes_count, 0)::bigint,
        coalesce(r.fork_count, 0)::bigint,
        coalesce(r.views_count, 0)::bigint,
        coalesce(r.published_at, r.updated_at, r.created_at)
      ) AS hot_score,
      r.room_geometry,
      private.room_preview_items(r.id) AS preview_items
    FROM public.rooms r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE
      (
        (src = 'community' AND r.visibility = 'public' AND p.is_public IS TRUE)
        OR (src = 'mine' AND r.user_id = uid)
      )
      AND (
        q IS NULL
        OR lower(r.name) LIKE '%' || q || '%'
        OR lower(p.handle) LIKE '%' || q || '%'
        OR lower(coalesce(p.display_name, '')) LIKE '%' || q || '%'
      )
  ),
  counted AS (
    SELECT b.*, count(*) OVER ()::bigint AS total_count
    FROM base b
  )
  SELECT
    c.room_id, c.name, c.thumbnail_path, c.user_id, c.visibility,
    c.likes_count, c.views_count, c.fork_count,
    c.published_at, c.updated_at,
    c.creator_handle, c.creator_display_name, c.liked_by_me, c.hot_score,
    c.room_geometry, c.preview_items, c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN srt = 'hot' THEN c.hot_score END DESC NULLS LAST,
    CASE WHEN srt = 'likes' THEN c.likes_count END DESC NULLS LAST,
    CASE WHEN srt = 'views' THEN c.views_count END DESC NULLS LAST,
    CASE WHEN srt = 'clones' THEN c.fork_count END DESC NULLS LAST,
    CASE WHEN srt = 'newest' THEN c.updated_at END DESC NULLS LAST,
    c.published_at DESC NULLS LAST,
    c.room_id ASC
  LIMIT lim OFFSET off;
END;
$$;

DROP FUNCTION IF EXISTS public.get_gallery_rooms(text, text, int, int);

REVOKE ALL ON FUNCTION public.get_gallery_rooms(text, text, int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gallery_rooms(text, text, int, int, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8) Lightweight gallery home shelves
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_gallery_home(
  p_room_limit int DEFAULT 12,
  p_model_limit int DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rlim int := greatest(1, least(coalesce(p_room_limit, 12), 24));
  mlim int := greatest(1, least(coalesce(p_model_limit, 12), 24));
  result jsonb := '{}'::jsonb;
BEGIN
  result := result || jsonb_build_object(
    'rooms_hot',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(x) - 'total_count')
      FROM public.get_gallery_rooms('hot', NULL, rlim, 0) x
    ), '[]'::jsonb),
    'rooms_likes',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(x) - 'total_count')
      FROM public.get_gallery_rooms('likes', NULL, rlim, 0) x
    ), '[]'::jsonb),
    'models_hot',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(x) - 'total_count')
      FROM public.get_gallery_catalog('community', 'hot', NULL, NULL, mlim, 0) x
    ), '[]'::jsonb),
    'models_likes',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(x) - 'total_count')
      FROM public.get_gallery_catalog('community', 'likes', NULL, NULL, mlim, 0) x
    ), '[]'::jsonb)
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_gallery_home(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gallery_home(int, int) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9) Extend get_profile_page with engagement fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_profile_page(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  prof public.profiles%ROWTYPE;
  uid uuid := auth.uid();
  is_owner boolean;
  rooms_json jsonb;
BEGIN
  pid := private.resolve_profile_id(p_handle);
  IF pid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE id = pid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  is_owner := (uid IS NOT NULL AND uid = prof.id);

  IF NOT prof.is_public AND NOT is_owner THEN
    RETURN NULL;
  END IF;

  IF is_owner THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'visibility', r.visibility,
          'updated_at', r.updated_at,
          'fork_count', r.fork_count,
          'likes_count', coalesce(r.likes_count, 0),
          'views_count', coalesce(r.views_count, 0),
          'published_at', r.published_at,
          'thumbnail_path', NULLIF(trim(r.thumbnail_path), ''),
          'forked_from', r.forked_from,
          'attribution', private.public_attribution(r.forked_from),
          'room_geometry', r.room_geometry,
          'items', private.room_preview_items(r.id)
        )
        ORDER BY r.sort_order, r.updated_at DESC
      ),
      '[]'::jsonb
    )
    INTO rooms_json
    FROM public.rooms r
    WHERE r.user_id = prof.id;
  ELSE
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'visibility', r.visibility,
          'updated_at', r.updated_at,
          'fork_count', r.fork_count,
          'likes_count', coalesce(r.likes_count, 0),
          'views_count', coalesce(r.views_count, 0),
          'published_at', r.published_at,
          'thumbnail_path', NULLIF(trim(r.thumbnail_path), ''),
          'forked_from', r.forked_from,
          'attribution', private.public_attribution(r.forked_from),
          'room_geometry', r.room_geometry,
          'items', private.room_preview_items(r.id)
        )
        ORDER BY r.updated_at DESC
      ),
      '[]'::jsonb
    )
    INTO rooms_json
    FROM public.rooms r
    WHERE r.user_id = prof.id
      AND r.visibility = 'public';
  END IF;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', prof.id,
      'handle', prof.handle,
      'display_name', prof.display_name,
      'bio', prof.bio,
      'avatar_path', prof.avatar_path,
      'is_public', prof.is_public
    ),
    'canonical_handle', prof.handle,
    'is_owner', is_owner,
    'rooms', COALESCE(rooms_json, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_profile_page(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_page(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10) Extend get_public_room with engagement fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_room(p_handle text, p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  prof public.profiles%ROWTYPE;
  room_row public.rooms%ROWTYPE;
  items_json jsonb;
  dims_json jsonb;
  paths text[];
  thumb text;
  uid uuid := auth.uid();
  liked boolean := false;
BEGIN
  pid := private.resolve_profile_id(p_handle);
  IF pid IS NULL THEN
    RAISE EXCEPTION 'room not found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE id = pid;
  IF NOT FOUND OR NOT prof.is_public THEN
    RAISE EXCEPTION 'room not found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO room_row
  FROM public.rooms r
  WHERE r.id = p_room_id
    AND r.user_id = pid
    AND r.visibility = 'public';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found'
      USING ERRCODE = 'P0001';
  END IF;

  thumb := NULLIF(trim(room_row.thumbnail_path), '');

  IF uid IS NOT NULL THEN
    liked := EXISTS (
      SELECT 1 FROM public.room_likes rl
      WHERE rl.user_id = uid AND rl.room_id = room_row.id
    );
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(ri) ORDER BY ri.sort_order), '[]'::jsonb)
  INTO items_json
  FROM public.room_items ri
  WHERE ri.room_id = room_row.id;

  SELECT COALESCE(
    jsonb_object_agg(
      fc.model_url,
      jsonb_build_array(fc.width_in, fc.height_in, fc.depth_in)
    ),
    '{}'::jsonb
  )
  INTO dims_json
  FROM public.furniture_catalog fc
  WHERE fc.model_url IN (
    SELECT NULLIF(trim(ri.model_url), '')
    FROM public.room_items ri
    WHERE ri.room_id = room_row.id
      AND ri.kind = 'imported'
      AND ri.model_url IS NOT NULL
      AND trim(ri.model_url) !~* '^https?://'
  );

  SELECT COALESCE(array_agg(path), '{}'::text[])
  INTO paths
  FROM (
    SELECT DISTINCT path
    FROM (
      SELECT NULLIF(trim(ri.model_url), '') AS path
      FROM public.room_items ri
      WHERE ri.room_id = room_row.id
      UNION
      SELECT NULLIF(trim(ri.blanket_texture_path), '') AS path
      FROM public.room_items ri
      WHERE ri.room_id = room_row.id
    ) raw
    WHERE path IS NOT NULL
      AND path !~* '^https?://'
      AND path !~* '^blob:'
  ) filtered;

  RETURN jsonb_build_object(
    'room', jsonb_build_object(
      'id', room_row.id,
      'name', room_row.name,
      'environment', room_row.environment,
      'room_geometry', room_row.room_geometry,
      'fork_count', room_row.fork_count,
      'forked_from', room_row.forked_from,
      'thumbnail_path', thumb,
      'likes_count', coalesce(room_row.likes_count, 0),
      'views_count', coalesce(room_row.views_count, 0),
      'published_at', room_row.published_at,
      'liked_by_me', liked
    ),
    'items', items_json,
    'catalog_dims', COALESCE(dims_json, '{}'::jsonb),
    'asset_paths', to_jsonb(paths),
    'owner', jsonb_build_object(
      'handle', prof.handle,
      'display_name', prof.display_name,
      'avatar_path', prof.avatar_path,
      'id', prof.id
    ),
    'attribution', private.public_attribution(room_row.forked_from),
    'allow_copy', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_room(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_room(text, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
