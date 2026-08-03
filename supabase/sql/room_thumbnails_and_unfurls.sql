-- Room thumbnails + OG unfurl RPCs (Phase 3)
-- Apply in Supabase SQL Editor or via migration tooling.
-- Private bucket: room-thumbnails. Sign only with share grant or public room+profile.
-- Unfurl RPCs return minimal metadata only (no items/emails/private fields).

-- ── Bucket ───────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'room-thumbnails',
  'room-thumbnails',
  false,
  3145728,
  ARRAY['image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 3145728,
    allowed_mime_types = ARRAY['image/jpeg'];

-- ── Thumbnail access helpers ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_public_room_thumbnail(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rooms r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE NULLIF(trim(r.thumbnail_path), '') = p_object_path
      AND r.visibility = 'public'
      AND p.is_public = true
  );
$$;

REVOKE ALL ON FUNCTION public.has_public_room_thumbnail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_public_room_thumbnail(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.has_room_thumbnail_access(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Owner folder
    ((storage.foldername(p_object_path))[1] = ((SELECT auth.uid())::text))
    OR public.has_share_asset_grant(p_object_path)
    OR public.has_public_room_thumbnail(p_object_path);
$$;

REVOKE ALL ON FUNCTION public.has_room_thumbnail_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_room_thumbnail_access(text) TO anon, authenticated;

-- ── Storage policies ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS room_thumbnails_insert ON storage.objects;
DROP POLICY IF EXISTS room_thumbnails_update ON storage.objects;
DROP POLICY IF EXISTS room_thumbnails_delete ON storage.objects;
DROP POLICY IF EXISTS room_thumbnails_select ON storage.objects;

CREATE POLICY room_thumbnails_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'room-thumbnails'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

CREATE POLICY room_thumbnails_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'room-thumbnails'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  )
  WITH CHECK (
    bucket_id = 'room-thumbnails'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

CREATE POLICY room_thumbnails_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'room-thumbnails'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

CREATE POLICY room_thumbnails_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'room-thumbnails'
    AND public.has_room_thumbnail_access(name)
  );

-- ── Extend share grants to include room thumbnail ────────────────────────────

CREATE OR REPLACE FUNCTION public._grant_share_assets(p_token text, p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exp timestamptz := now() + interval '1 hour';
BEGIN
  DELETE FROM public.share_asset_grants
  WHERE token = p_token;

  INSERT INTO public.share_asset_grants (object_path, room_id, token, expires_at)
  SELECT DISTINCT path, p_room_id, p_token, exp
  FROM (
    SELECT NULLIF(trim(ri.model_url), '') AS path
    FROM public.room_items ri
    WHERE ri.room_id = p_room_id
    UNION
    SELECT NULLIF(trim(ri.blanket_texture_path), '') AS path
    FROM public.room_items ri
    WHERE ri.room_id = p_room_id
    UNION
    SELECT NULLIF(trim(r.thumbnail_path), '') AS path
    FROM public.rooms r
    WHERE r.id = p_room_id
  ) paths
  WHERE path IS NOT NULL
    AND path !~* '^https?://'
    AND path !~* '^blob:';
END;
$$;

REVOKE ALL ON FUNCTION public._grant_share_assets(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._grant_share_assets(text, uuid) FROM anon, authenticated;

-- ── Update get_shared_room: expose thumbnail_path; model asset_paths only ────

CREATE OR REPLACE FUNCTION public.get_shared_room(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.room_shares%ROWTYPE;
  room_row public.rooms%ROWTYPE;
  owner_name text;
  owner_handle text;
  items_json jsonb;
  dims_json jsonb;
  paths text[];
  thumb text;
BEGIN
  IF NOT public.is_share_token_format(p_token) THEN
    RAISE EXCEPTION 'invalid share link'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO share_row
  FROM public.room_shares s
  WHERE s.token = p_token
    AND s.revoked_at IS NULL
    AND (s.expires_at IS NULL OR s.expires_at > now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid share link'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO room_row
  FROM public.rooms r
  WHERE r.id = share_row.room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid share link'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.room_shares
  SET view_count = view_count + 1
  WHERE token = p_token;

  owner_name := COALESCE(private.safe_owner_display(room_row.user_id), 'Toova designer');
  owner_handle := private.safe_owner_handle(room_row.user_id);
  thumb := NULLIF(trim(room_row.thumbnail_path), '');

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

  PERFORM public._grant_share_assets(p_token, room_row.id);

  -- Model/texture paths only (thumbnail signed from room-thumbnails bucket).
  SELECT COALESCE(array_agg(g.object_path), '{}'::text[])
  INTO paths
  FROM public.share_asset_grants g
  WHERE g.token = p_token
    AND g.expires_at > now()
    AND (thumb IS NULL OR g.object_path IS DISTINCT FROM thumb);

  RETURN jsonb_build_object(
    'room', jsonb_build_object(
      'id', room_row.id,
      'name', room_row.name,
      'environment', room_row.environment,
      'room_geometry', room_row.room_geometry,
      'fork_count', room_row.fork_count,
      'thumbnail_path', thumb
    ),
    'items', items_json,
    'catalog_dims', COALESCE(dims_json, '{}'::jsonb),
    'asset_paths', to_jsonb(paths),
    'role', share_row.role,
    'allow_copy', share_row.allow_copy,
    'owner_display', owner_name,
    'owner_handle', owner_handle,
    'attribution', private.public_attribution(room_row.forked_from)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_room(text) TO anon, authenticated;

-- ── Update get_public_room: thumbnail_path + signable path list ──────────────

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
      'thumbnail_path', thumb
    ),
    'items', items_json,
    'catalog_dims', COALESCE(dims_json, '{}'::jsonb),
    'asset_paths', to_jsonb(paths),
    'owner', jsonb_build_object(
      'handle', prof.handle,
      'display_name', prof.display_name,
      'avatar_path', prof.avatar_path
    ),
    'attribution', private.public_attribution(room_row.forked_from),
    'allow_copy', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_room(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_room(text, uuid) TO anon, authenticated;

-- ── Unfurl RPCs (minimal; identical miss for invalid/revoked/private) ────────

CREATE OR REPLACE FUNCTION public.get_share_unfurl(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.room_shares%ROWTYPE;
  room_row public.rooms%ROWTYPE;
BEGIN
  IF NOT public.is_share_token_format(p_token) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO share_row
  FROM public.room_shares s
  WHERE s.token = p_token
    AND s.revoked_at IS NULL
    AND (s.expires_at IS NULL OR s.expires_at > now());

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO room_row
  FROM public.rooms r
  WHERE r.id = share_row.room_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Side effect: unlock thumbnail (and room assets) for short-lived signed URLs.
  PERFORM public._grant_share_assets(p_token, room_row.id);

  RETURN jsonb_build_object(
    'title', room_row.name,
    'owner_display', COALESCE(private.safe_owner_display(room_row.user_id), 'Toova designer'),
    'thumbnail_path', NULLIF(trim(room_row.thumbnail_path), ''),
    'canonical_url', 'https://toova.net/r/' || p_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_share_unfurl(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_share_unfurl(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_room_unfurl(p_handle text, p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  prof public.profiles%ROWTYPE;
  room_row public.rooms%ROWTYPE;
  h text;
BEGIN
  h := lower(trim(COALESCE(p_handle, '')));
  IF h !~ '^[a-z0-9_]{3,30}$' THEN
    RETURN NULL;
  END IF;

  pid := private.resolve_profile_id(h);
  IF pid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE id = pid;
  IF NOT FOUND OR NOT prof.is_public THEN
    RETURN NULL;
  END IF;

  SELECT * INTO room_row
  FROM public.rooms r
  WHERE r.id = p_room_id
    AND r.user_id = pid
    AND r.visibility = 'public';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'title', room_row.name,
    'owner_display', COALESCE(NULLIF(trim(prof.display_name), ''), '@' || prof.handle),
    'thumbnail_path', NULLIF(trim(room_row.thumbnail_path), ''),
    'canonical_url', 'https://toova.net/u/' || prof.handle || '/r/' || room_row.id::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_room_unfurl(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_room_unfurl(text, uuid) TO anon, authenticated;
