-- Storage keys used for service-role reads must be canonical and owned.
-- A path with ".." or another user's folder must not become a share grant,
-- a public-room asset, or an OG image.

-- ---------------------------------------------------------------------------
-- 1) Path shape
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_canonical_storage_key(p_path text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  raw text := trim(COALESCE(p_path, ''));
  parts text[];
  seg text;
  i int;
BEGIN
  IF raw = '' OR char_length(raw) > 1024 THEN
    RETURN false;
  END IF;
  IF raw ~ '[[:cntrl:]\\]' OR position('://' IN raw) > 0 OR raw ~* '^blob:' THEN
    RETURN false;
  END IF;
  IF left(raw, 1) = '/' OR right(raw, 1) = '/' OR position('..' IN raw) > 0 THEN
    RETURN false;
  END IF;

  parts := string_to_array(raw, '/');
  IF parts IS NULL OR array_length(parts, 1) IS NULL OR array_length(parts, 1) < 2 THEN
    RETURN false;
  END IF;
  IF parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;

  FOR i IN 1..array_length(parts, 1) LOOP
    seg := parts[i];
    IF seg IS NULL OR seg = '' OR seg = '.' OR seg = '..' THEN
      RETURN false;
    END IF;
    IF seg !~ '^[A-Za-z0-9._-]{1,200}$' THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_key_owner(p_path text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_canonical_storage_key(p_path)
    THEN split_part(trim(p_path), '/', 1)::uuid
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.owned_storage_key(p_path text, p_owner uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_owner IS NOT NULL
     AND public.storage_key_owner(p_path) = p_owner
    THEN trim(p_path)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_static_asset_path(p_path text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  raw text := trim(COALESCE(p_path, ''));
  parts text[];
  seg text;
  i int;
BEGIN
  IF raw = '' OR char_length(raw) > 1024 THEN
    RETURN false;
  END IF;
  IF raw !~ '^(checklist-refs|marketing)/' THEN
    RETURN false;
  END IF;
  IF raw ~ '[[:cntrl:]\\]' OR position('://' IN raw) > 0 OR position('..' IN raw) > 0 THEN
    RETURN false;
  END IF;
  IF left(raw, 1) = '/' OR right(raw, 1) = '/' THEN
    RETURN false;
  END IF;

  parts := string_to_array(raw, '/');
  IF parts IS NULL OR array_length(parts, 1) IS NULL OR array_length(parts, 1) < 2 THEN
    RETURN false;
  END IF;

  FOR i IN 1..array_length(parts, 1) LOOP
    seg := parts[i];
    IF seg IS NULL OR seg = '' OR seg = '.' OR seg = '..' THEN
      RETURN false;
    END IF;
    IF seg !~ '^[A-Za-z0-9._-]{1,200}$' THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

-- Public catalog file whose first folder is that row's owner.
CREATE OR REPLACE FUNCTION public.catalog_path_is_public(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.furniture_catalog fc
    WHERE fc.visibility = 'public'
      AND fc.user_id IS NOT NULL
      AND public.owned_storage_key(p_path, fc.user_id) = trim(p_path)
      AND (
        NULLIF(trim(fc.model_url), '') = trim(p_path)
        OR NULLIF(trim(fc.usdz_path), '') = trim(p_path)
        OR NULLIF(trim(fc.thumbnail_path), '') = trim(p_path)
        OR NULLIF(trim(fc.silhouette_path), '') = trim(p_path)
      )
  );
$$;

-- Path a room may store or sign: own key, collaborator key, public catalog, static
-- repo asset, or a key inherited from the server-created fork source.
CREATE OR REPLACE FUNCTION public.room_asset_path_allowed(p_path text, p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_path IS NOT NULL
    AND length(trim(p_path)) > 0
    AND (
      public.is_static_asset_path(p_path)
      OR (
        public.is_canonical_storage_key(p_path)
        AND (
          EXISTS (
            SELECT 1
            FROM public.rooms r
            WHERE r.id = p_room_id
              AND r.user_id = public.storage_key_owner(p_path)
          )
          OR EXISTS (
            SELECT 1
            FROM public.room_collaborators c
            WHERE c.room_id = p_room_id
              AND c.user_id = public.storage_key_owner(p_path)
          )
          OR public.catalog_path_is_public(p_path)
          OR EXISTS (
            SELECT 1
            FROM public.rooms child
            JOIN public.room_items sri ON sri.room_id = child.forked_from
            WHERE child.id = p_room_id
              AND child.forked_from IS NOT NULL
              AND (
                NULLIF(trim(sri.model_url), '') = trim(p_path)
                OR NULLIF(trim(sri.blanket_texture_path), '') = trim(p_path)
                OR NULLIF(trim(sri.finish_texture_path), '') = trim(p_path)
              )
          )
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.catalog_column_path_ok(p_path text, p_owner uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    p_path IS NULL
    OR trim(p_path) = ''
    OR public.is_static_asset_path(p_path)
    OR public.owned_storage_key(p_path, p_owner) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.is_canonical_storage_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.storage_key_owner(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.owned_storage_key(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_static_asset_path(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_path_is_public(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.room_asset_path_allowed(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_column_path_ok(text, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Public and share reads require ownership
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_public_catalog_asset(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.catalog_path_is_public(p_object_path);
$$;

REVOKE ALL ON FUNCTION public.has_public_catalog_asset(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_public_catalog_asset(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.has_public_room_asset(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_items ri
    JOIN public.rooms r ON r.id = ri.room_id
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.visibility = 'public'
      AND p.is_public = true
      AND public.owned_storage_key(p_object_path, r.user_id) = trim(p_object_path)
      AND (
        NULLIF(trim(ri.model_url), '') = trim(p_object_path)
        OR NULLIF(trim(ri.blanket_texture_path), '') = trim(p_object_path)
        OR NULLIF(trim(ri.finish_texture_path), '') = trim(p_object_path)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_public_room_asset(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_public_room_asset(text) TO anon, authenticated;

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
    WHERE public.owned_storage_key(r.thumbnail_path, r.user_id) = trim(p_object_path)
      AND r.visibility = 'public'
      AND p.is_public = true
  );
$$;

REVOKE ALL ON FUNCTION public.has_public_room_thumbnail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_public_room_thumbnail(text) TO anon, authenticated;

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
    SELECT NULLIF(trim(ri.finish_texture_path), '') AS path
    FROM public.room_items ri
    WHERE ri.room_id = p_room_id
    UNION
    SELECT NULLIF(trim(r.thumbnail_path), '') AS path
    FROM public.rooms r
    WHERE r.id = p_room_id
  ) paths
  WHERE path IS NOT NULL
    AND public.is_canonical_storage_key(path)
    AND public.room_asset_path_allowed(path, p_room_id);
END;
$$;

REVOKE ALL ON FUNCTION public._grant_share_assets(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_share_asset_paths(p_token text)
RETURNS TABLE(object_path text, bucket_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.load_active_share(p_token);
  EXCEPTION
    WHEN raise_exception THEN
      RETURN;
  END;

  PERFORM public._grant_share_assets(
    p_token,
    (SELECT room_id FROM public.room_shares WHERE token = p_token)
  );

  RETURN QUERY
  SELECT
    g.object_path,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.rooms r
        JOIN public.room_shares s ON s.room_id = r.id
        WHERE s.token = p_token
          AND public.owned_storage_key(r.thumbnail_path, r.user_id) = g.object_path
      ) THEN 'room-thumbnails'::text
      ELSE 'model-files'::text
    END AS bucket_id
  FROM public.share_asset_grants g
  WHERE g.token = p_token
    AND g.expires_at > now()
    AND public.is_canonical_storage_key(g.object_path)
    AND public.room_asset_path_allowed(g.object_path, g.room_id);
END;
$$;

REVOKE ALL ON FUNCTION public.list_share_asset_paths(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_share_asset_paths(text) TO anon, authenticated;

-- Unfurl: do not hand the gateway a thumbnail it should not fetch.
CREATE OR REPLACE FUNCTION public.get_share_unfurl(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.room_shares%ROWTYPE;
  room_row public.rooms%ROWTYPE;
  thumb text;
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

  PERFORM public._grant_share_assets(p_token, room_row.id);

  thumb := public.owned_storage_key(room_row.thumbnail_path, room_row.user_id);

  RETURN jsonb_build_object(
    'title', room_row.name,
    'owner_display', COALESCE(private.safe_owner_display(room_row.user_id), 'Toova designer'),
    'owner_id', room_row.user_id,
    'thumbnail_path', thumb,
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
  thumb text;
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

  thumb := public.owned_storage_key(room_row.thumbnail_path, room_row.user_id);

  RETURN jsonb_build_object(
    'title', room_row.name,
    'owner_display', COALESCE(NULLIF(trim(prof.display_name), ''), '@' || prof.handle),
    'owner_id', room_row.user_id,
    'thumbnail_path', thumb,
    'canonical_url', 'https://toova.net/u/' || prof.handle || '/r/' || room_row.id::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_room_unfurl(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_room_unfurl(text, uuid) TO anon, authenticated;

-- Drop unowned avatar / thumbnail strings from the public profile payload.
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
          'thumbnail_path', public.owned_storage_key(r.thumbnail_path, r.user_id),
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
          'thumbnail_path', public.owned_storage_key(r.thumbnail_path, r.user_id),
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
      'avatar_path', public.owned_storage_key(prof.avatar_path, prof.id),
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
-- 3) Reject bad paths on write
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profiles_guard_avatar_path()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.avatar_path IS NOT NULL AND trim(NEW.avatar_path) <> ''
     AND public.owned_storage_key(NEW.avatar_path, NEW.id) IS NULL THEN
    RAISE EXCEPTION 'invalid avatar path'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_avatar_path ON public.profiles;
CREATE TRIGGER trg_profiles_avatar_path
  BEFORE INSERT OR UPDATE OF avatar_path ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_avatar_path();

CREATE OR REPLACE FUNCTION public.rooms_guard_thumbnail_path()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.thumbnail_path IS NOT NULL AND trim(NEW.thumbnail_path) <> ''
     AND public.owned_storage_key(NEW.thumbnail_path, NEW.user_id) IS NULL THEN
    RAISE EXCEPTION 'invalid storage path'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rooms_thumbnail_path ON public.rooms;
CREATE TRIGGER trg_rooms_thumbnail_path
  BEFORE INSERT OR UPDATE OF thumbnail_path ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.rooms_guard_thumbnail_path();

CREATE OR REPLACE FUNCTION public.room_items_guard_asset_paths()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.model_url IS NOT NULL AND trim(NEW.model_url) <> ''
     AND NOT public.room_asset_path_allowed(NEW.model_url, NEW.room_id) THEN
    RAISE EXCEPTION 'invalid storage path'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.blanket_texture_path IS NOT NULL AND trim(NEW.blanket_texture_path) <> ''
     AND NOT public.room_asset_path_allowed(NEW.blanket_texture_path, NEW.room_id) THEN
    RAISE EXCEPTION 'invalid storage path'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.finish_texture_path IS NOT NULL AND trim(NEW.finish_texture_path) <> ''
     AND NOT public.room_asset_path_allowed(NEW.finish_texture_path, NEW.room_id) THEN
    RAISE EXCEPTION 'invalid storage path'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_items_asset_paths ON public.room_items;
CREATE TRIGGER trg_room_items_asset_paths
  BEFORE INSERT OR UPDATE OF model_url, blanket_texture_path, finish_texture_path
  ON public.room_items
  FOR EACH ROW
  EXECUTE FUNCTION public.room_items_guard_asset_paths();

CREATE OR REPLACE FUNCTION public.furniture_catalog_guard_asset_paths()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.catalog_column_path_ok(NEW.model_url, NEW.user_id)
     OR NOT public.catalog_column_path_ok(NEW.thumbnail_path, NEW.user_id)
     OR NOT public.catalog_column_path_ok(NEW.usdz_path, NEW.user_id)
     OR NOT public.catalog_column_path_ok(NEW.silhouette_path, NEW.user_id) THEN
    RAISE EXCEPTION 'invalid storage path'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_furniture_catalog_asset_paths ON public.furniture_catalog;
CREATE TRIGGER trg_furniture_catalog_asset_paths
  BEFORE INSERT OR UPDATE OF model_url, thumbnail_path, usdz_path, silhouette_path, user_id
  ON public.furniture_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.furniture_catalog_guard_asset_paths();

REVOKE ALL ON FUNCTION public.profiles_guard_avatar_path() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rooms_guard_thumbnail_path() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.room_items_guard_asset_paths() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.furniture_catalog_guard_asset_paths() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Drop paths that already point outside the owner's folder
-- ---------------------------------------------------------------------------

UPDATE public.profiles
SET avatar_path = NULL
WHERE avatar_path IS NOT NULL
  AND public.owned_storage_key(avatar_path, id) IS NULL;

UPDATE public.rooms
SET thumbnail_path = NULL
WHERE thumbnail_path IS NOT NULL
  AND public.owned_storage_key(thumbnail_path, user_id) IS NULL;

UPDATE public.room_items ri
SET
  model_url = CASE
    WHEN model_url IS NOT NULL AND NOT public.room_asset_path_allowed(model_url, ri.room_id)
    THEN NULL
    ELSE model_url
  END,
  blanket_texture_path = CASE
    WHEN blanket_texture_path IS NOT NULL
     AND NOT public.room_asset_path_allowed(blanket_texture_path, ri.room_id)
    THEN NULL
    ELSE blanket_texture_path
  END,
  finish_texture_path = CASE
    WHEN finish_texture_path IS NOT NULL
     AND NOT public.room_asset_path_allowed(finish_texture_path, ri.room_id)
    THEN NULL
    ELSE finish_texture_path
  END
WHERE
  (model_url IS NOT NULL AND NOT public.room_asset_path_allowed(model_url, ri.room_id))
  OR (
    blanket_texture_path IS NOT NULL
    AND NOT public.room_asset_path_allowed(blanket_texture_path, ri.room_id)
  )
  OR (
    finish_texture_path IS NOT NULL
    AND NOT public.room_asset_path_allowed(finish_texture_path, ri.room_id)
  );

UPDATE public.furniture_catalog fc
SET
  model_url = CASE
    WHEN NOT public.catalog_column_path_ok(model_url, fc.user_id) THEN NULL
    ELSE model_url
  END,
  thumbnail_path = CASE
    WHEN NOT public.catalog_column_path_ok(thumbnail_path, fc.user_id) THEN NULL
    ELSE thumbnail_path
  END,
  usdz_path = CASE
    WHEN NOT public.catalog_column_path_ok(usdz_path, fc.user_id) THEN NULL
    ELSE usdz_path
  END,
  silhouette_path = CASE
    WHEN NOT public.catalog_column_path_ok(silhouette_path, fc.user_id) THEN NULL
    ELSE silhouette_path
  END
WHERE NOT public.catalog_column_path_ok(model_url, fc.user_id)
   OR NOT public.catalog_column_path_ok(thumbnail_path, fc.user_id)
   OR NOT public.catalog_column_path_ok(usdz_path, fc.user_id)
   OR NOT public.catalog_column_path_ok(silhouette_path, fc.user_id);

DELETE FROM public.share_asset_grants g
WHERE NOT public.is_canonical_storage_key(g.object_path)
   OR NOT public.room_asset_path_allowed(g.object_path, g.room_id);
