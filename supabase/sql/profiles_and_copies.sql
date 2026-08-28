-- Phase 2: profiles, public rooms, privacy-safe forks, avatar storage.
-- Security: no anon SELECT on profiles/rooms; public access via SECURITY DEFINER RPCs.
-- Run after room_sharing.sql.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- ── Profiles ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  handle       text NOT NULL,
  display_name text NOT NULL,
  bio          text NOT NULL DEFAULT '',
  avatar_path  text,
  is_public    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_handle_format CHECK (
    handle ~ '^[a-z0-9_]{3,30}$'
  ),
  CONSTRAINT profiles_display_name_len CHECK (
    char_length(trim(display_name)) BETWEEN 1 AND 60
  ),
  CONSTRAINT profiles_bio_len CHECK (
    char_length(bio) <= 280
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_unique
  ON public.profiles (handle);

CREATE TABLE IF NOT EXISTS public.profile_handle_aliases (
  handle     text PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_handle_aliases_format CHECK (
    handle ~ '^[a-z0-9_]{3,30}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_profile_handle_aliases_profile
  ON public.profile_handle_aliases (profile_id);

CREATE INDEX IF NOT EXISTS idx_rooms_forked_from
  ON public.rooms (forked_from)
  WHERE forked_from IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_public_owner
  ON public.rooms (user_id)
  WHERE visibility = 'public';

-- ── Handle helpers ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.sanitize_handle_base(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cleaned text;
BEGIN
  cleaned := lower(coalesce(raw, ''));
  cleaned := regexp_replace(cleaned, '[^a-z0-9_]+', '_', 'g');
  cleaned := regexp_replace(cleaned, '_+', '_', 'g');
  cleaned := trim(both '_' from cleaned);
  IF cleaned = '' THEN
    cleaned := 'user';
  END IF;
  IF length(cleaned) < 3 THEN
    cleaned := rpad(cleaned, 3, '0');
  END IF;
  IF length(cleaned) > 24 THEN
    cleaned := left(cleaned, 24);
  END IF;
  RETURN cleaned;
END;
$$;

CREATE OR REPLACE FUNCTION private.allocate_unique_handle(preferred text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base text := private.sanitize_handle_base(preferred);
  candidate text;
  n int := 0;
BEGIN
  LOOP
    IF n = 0 THEN
      candidate := base;
    ELSE
      candidate := left(base, greatest(1, 30 - length(n::text))) || n::text;
      IF length(candidate) < 3 THEN
        candidate := rpad(candidate, 3, '0');
      END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.handle = candidate)
       AND NOT EXISTS (SELECT 1 FROM public.profile_handle_aliases a WHERE a.handle = candidate)
    THEN
      RETURN candidate;
    END IF;

    n := n + 1;
    IF n > 10000 THEN
      RAISE EXCEPTION 'could not allocate handle'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.create_profile_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  email_local text;
  meta_name text;
  new_handle text;
  new_display text;
BEGIN
  email_local := split_part(coalesce(NEW.email, 'user'), '@', 1);
  meta_name := nullif(trim(coalesce(NEW.raw_user_meta_data->>'full_name', '')), '');
  new_handle := private.allocate_unique_handle(email_local);
  new_display := coalesce(
    meta_name,
    initcap(replace(replace(email_local, '.', ' '), '_', ' '))
  );
  IF char_length(new_display) > 60 THEN
    new_display := left(new_display, 60);
  END IF;
  IF char_length(trim(new_display)) < 1 THEN
    new_display := 'Toova designer';
  END IF;

  INSERT INTO public.profiles (id, handle, display_name, is_public)
  VALUES (NEW.id, new_handle, new_display, false)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.create_profile_for_user();

-- Backfill existing users
DO $$
DECLARE
  u record;
  email_local text;
  meta_name text;
  new_handle text;
  new_display text;
BEGIN
  FOR u IN SELECT id, email, raw_user_meta_data FROM auth.users LOOP
    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id) THEN
      CONTINUE;
    END IF;
    email_local := split_part(coalesce(u.email, 'user'), '@', 1);
    meta_name := nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', '')), '');
    new_handle := private.allocate_unique_handle(email_local);
    new_display := coalesce(
      meta_name,
      initcap(replace(replace(email_local, '.', ' '), '_', ' '))
    );
    IF char_length(new_display) > 60 THEN
      new_display := left(new_display, 60);
    END IF;
    IF char_length(trim(new_display)) < 1 THEN
      new_display := 'Toova designer';
    END IF;
    INSERT INTO public.profiles (id, handle, display_name, is_public)
    VALUES (u.id, new_handle, new_display, false)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- ── Profile RLS ──────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_handle_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
DROP POLICY IF EXISTS profile_aliases_self_select ON public.profile_handle_aliases;

CREATE POLICY profiles_self_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Aliases are server-managed; owners can read their own for UX.
CREATE POLICY profile_aliases_self_select ON public.profile_handle_aliases
  FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
REVOKE INSERT, DELETE ON public.profiles FROM authenticated;
REVOKE ALL ON public.profiles FROM anon;

GRANT SELECT ON public.profile_handle_aliases TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.profile_handle_aliases FROM authenticated;
REVOKE ALL ON public.profile_handle_aliases FROM anon;

-- ── Protect room lineage / visibility columns ────────────────────────────────

CREATE OR REPLACE FUNCTION public.rooms_protect_fork_and_visibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Trusted RPCs set app.toova_bypass_room_guards=1 for this transaction.
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
    -- Clients may only create private rooms; publishing goes through RPC.
    NEW.visibility := 'private';
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rooms_protect_fork_and_visibility ON public.rooms;
CREATE TRIGGER rooms_protect_fork_and_visibility
  BEFORE INSERT OR UPDATE OF forked_from, fork_count, visibility ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.rooms_protect_fork_and_visibility();

-- Column-level: clients cannot UPDATE protected columns even if they try.
REVOKE UPDATE ON TABLE public.rooms FROM authenticated;
GRANT UPDATE (
  name,
  sort_order,
  updated_at,
  environment,
  room_geometry,
  thumbnail_path
) ON TABLE public.rooms TO authenticated;

-- ── Avatar storage bucket ────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-avatars',
  'profile-avatars',
  false,
  2097152,
  ARRAY['image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg'];

CREATE OR REPLACE FUNCTION public.has_public_avatar_access(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.avatar_path = p_object_path
      AND (
        p.id = (SELECT auth.uid())
        OR p.is_public = true
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_public_avatar_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_public_avatar_access(text) TO anon, authenticated;

DROP POLICY IF EXISTS profile_avatars_insert ON storage.objects;
DROP POLICY IF EXISTS profile_avatars_update ON storage.objects;
DROP POLICY IF EXISTS profile_avatars_delete ON storage.objects;
DROP POLICY IF EXISTS profile_avatars_select ON storage.objects;

CREATE POLICY profile_avatars_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

CREATE POLICY profile_avatars_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  )
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

CREATE POLICY profile_avatars_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

CREATE POLICY profile_avatars_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND public.has_public_avatar_access(name)
  );

-- ── Public room asset access (path-scoped) ───────────────────────────────────

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
      AND (
        NULLIF(trim(ri.model_url), '') = p_object_path
        OR NULLIF(trim(ri.blanket_texture_path), '') = p_object_path
      )
      AND p_object_path !~* '^https?://'
      AND p_object_path !~* '^blob:'
  );
$$;

REVOKE ALL ON FUNCTION public.has_public_room_asset(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_public_room_asset(text) TO anon, authenticated;

DROP POLICY IF EXISTS model_files_select_public_room ON storage.objects;
CREATE POLICY model_files_select_public_room ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'model-files'
    AND public.has_public_room_asset(name)
  );

-- ── Shared helpers ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.resolve_profile_id(p_handle text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h text := lower(trim(coalesce(p_handle, '')));
  pid uuid;
BEGIN
  IF h !~ '^[a-z0-9_]{3,30}$' THEN
    RETURN NULL;
  END IF;

  SELECT p.id INTO pid FROM public.profiles p WHERE p.handle = h;
  IF pid IS NOT NULL THEN
    RETURN pid;
  END IF;

  SELECT a.profile_id INTO pid
  FROM public.profile_handle_aliases a
  WHERE a.handle = h;

  RETURN pid;
END;
$$;

CREATE OR REPLACE FUNCTION private.profile_public_identity(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.id IS NULL THEN NULL
    WHEN p.is_public OR p.id = (SELECT auth.uid()) THEN
      jsonb_build_object(
        'id', p.id,
        'handle', p.handle,
        'display_name', p.display_name,
        'bio', p.bio,
        'avatar_path', p.avatar_path,
        'is_public', p.is_public
      )
    ELSE NULL
  END
  FROM public.profiles p
  WHERE p.id = p_id;
$$;

CREATE OR REPLACE FUNCTION private.safe_owner_display(p_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.is_public THEN p.display_name
    ELSE 'Toova designer'
  END
  FROM public.profiles p
  WHERE p.id = p_id;
$$;

CREATE OR REPLACE FUNCTION private.safe_owner_handle(p_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.is_public THEN p.handle
    ELSE NULL
  END
  FROM public.profiles p
  WHERE p.id = p_id;
$$;

CREATE OR REPLACE FUNCTION private.room_preview_items(p_room_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ri.id,
        'kind', ri.kind,
        'pos_x', ri.pos_x,
        'pos_y', ri.pos_y,
        'pos_z', ri.pos_z,
        'rotation_y', ri.rotation_y,
        'size_w', ri.size_w,
        'size_h', ri.size_h,
        'size_d', ri.size_d,
        'model_url', ri.model_url,
        'silhouette_path', fc.silhouette_path
      )
      ORDER BY ri.sort_order
    ),
    '[]'::jsonb
  )
  FROM public.room_items ri
  LEFT JOIN public.furniture_catalog fc
    ON ri.kind = 'imported'
   AND NULLIF(trim(ri.model_url), '') IS NOT NULL
   AND NULLIF(trim(fc.model_url), '') = NULLIF(trim(ri.model_url), '')
  WHERE ri.room_id = p_room_id
    AND ri.kind IN (
      'bed', 'dresser', 'bookshelf', 'wardrobe', 'desk', 'chair', 'nightstand', 'lamp', 'imported'
    );
$$;

CREATE OR REPLACE FUNCTION private.public_attribution(p_forked_from uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.rooms%ROWTYPE;
  owner_prof public.profiles%ROWTYPE;
BEGIN
  IF p_forked_from IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO src FROM public.rooms WHERE id = p_forked_from;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('visible', false);
  END IF;

  SELECT * INTO owner_prof FROM public.profiles WHERE id = src.user_id;

  IF src.visibility = 'public'
     AND owner_prof.is_public
  THEN
    RETURN jsonb_build_object(
      'visible', true,
      'room_id', src.id,
      'room_name', src.name,
      'owner_handle', owner_prof.handle,
      'owner_display', owner_prof.display_name
    );
  END IF;

  RETURN jsonb_build_object('visible', false);
END;
$$;

CREATE OR REPLACE FUNCTION private.copy_room_as_fork(
  p_source_id uuid,
  p_uid uuid,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  room_row public.rooms%ROWTYPE;
  new_id uuid;
  room_count int;
  copy_name text;
  max_rooms constant int := 5;
BEGIN
  SELECT * INTO room_row FROM public.rooms WHERE id = p_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::int INTO room_count
  FROM public.rooms
  WHERE user_id = p_uid;

  IF room_count >= max_rooms THEN
    RAISE EXCEPTION 'room limit reached (% rooms)', max_rooms
      USING ERRCODE = 'P0001';
  END IF;

  copy_name := COALESCE(NULLIF(trim(p_name), ''), room_row.name || ' (copy)');

  -- Bypass client-facing room guards for this trusted fork path only.
  PERFORM set_config('app.toova_bypass_room_guards', '1', true);

  INSERT INTO public.rooms (
    user_id, name, environment, room_geometry, forked_from, visibility, fork_count
  )
  VALUES (
    p_uid,
    copy_name,
    room_row.environment,
    room_row.room_geometry,
    room_row.id,
    'private',
    0
  )
  RETURNING id INTO new_id;

  INSERT INTO public.room_items (
    room_id, kind, label,
    pos_x, pos_y, pos_z, rotation_y,
    size_w, size_h, size_d,
    bed_leg_height, natural_w, natural_h, natural_d,
    sort_order, model_url,
    bedding_enabled, blanket_color, blanket_texture_path,
    emitter, curated_product_id,
    instance_key, hanging_config
  )
  SELECT
    new_id, kind, label,
    pos_x, pos_y, pos_z, rotation_y,
    size_w, size_h, size_d,
    bed_leg_height, natural_w, natural_h, natural_d,
    sort_order, model_url,
    bedding_enabled, blanket_color, blanket_texture_path,
    emitter, curated_product_id,
    instance_key, hanging_config
  FROM public.room_items
  WHERE room_id = room_row.id
  ORDER BY sort_order;

  UPDATE public.rooms
  SET fork_count = fork_count + 1
  WHERE id = room_row.id;

  RETURN new_id;
END;
$$;

-- ── Profile update with handle aliases ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_own_profile(
  p_handle text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_is_public boolean DEFAULT NULL,
  p_avatar_path text DEFAULT NULL,
  p_clear_avatar boolean DEFAULT false
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.profiles%ROWTYPE;
  old_handle text;
  new_handle text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO row FROM public.profiles WHERE id = uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found'
      USING ERRCODE = 'P0001';
  END IF;

  old_handle := row.handle;

  IF p_handle IS NOT NULL THEN
    new_handle := lower(trim(p_handle));
    IF new_handle !~ '^[a-z0-9_]{3,30}$' THEN
      RAISE EXCEPTION 'invalid handle'
        USING ERRCODE = 'P0001';
    END IF;
    IF new_handle IS DISTINCT FROM old_handle THEN
      IF EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.handle = new_handle AND p.id <> uid
      ) OR EXISTS (
        SELECT 1 FROM public.profile_handle_aliases a
        WHERE a.handle = new_handle AND a.profile_id <> uid
      ) THEN
        RAISE EXCEPTION 'handle already taken'
          USING ERRCODE = 'P0001';
      END IF;

      -- Keep old handle as alias; drop alias if reclaiming own previous handle.
      DELETE FROM public.profile_handle_aliases
      WHERE handle = new_handle AND profile_id = uid;

      INSERT INTO public.profile_handle_aliases (handle, profile_id)
      VALUES (old_handle, uid)
      ON CONFLICT (handle) DO UPDATE
        SET profile_id = EXCLUDED.profile_id,
            created_at = now();

      row.handle := new_handle;
    END IF;
  END IF;

  IF p_display_name IS NOT NULL THEN
    IF char_length(trim(p_display_name)) < 1 OR char_length(p_display_name) > 60 THEN
      RAISE EXCEPTION 'invalid display name'
        USING ERRCODE = 'P0001';
    END IF;
    row.display_name := trim(p_display_name);
  END IF;

  IF p_bio IS NOT NULL THEN
    IF char_length(p_bio) > 280 THEN
      RAISE EXCEPTION 'bio too long'
        USING ERRCODE = 'P0001';
    END IF;
    row.bio := p_bio;
  END IF;

  IF p_is_public IS NOT NULL THEN
    row.is_public := p_is_public;
  END IF;

  IF p_clear_avatar THEN
    row.avatar_path := NULL;
  ELSIF p_avatar_path IS NOT NULL THEN
    IF p_avatar_path !~ ('^' || uid::text || '/') THEN
      RAISE EXCEPTION 'invalid avatar path'
        USING ERRCODE = 'P0001';
    END IF;
    row.avatar_path := p_avatar_path;
  END IF;

  row.updated_at := now();

  UPDATE public.profiles
  SET handle = row.handle,
      display_name = row.display_name,
      bio = row.bio,
      is_public = row.is_public,
      avatar_path = row.avatar_path,
      updated_at = row.updated_at
  WHERE id = uid
  RETURNING * INTO row;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_profile(text, text, text, boolean, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_own_profile(text, text, text, boolean, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_own_profile(text, text, text, boolean, text, boolean) TO authenticated;

-- ── RPC: get_profile_page ────────────────────────────────────────────────────

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

  -- Private profiles are indistinguishable from missing for non-owners.
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

-- ── RPC: get_public_room ─────────────────────────────────────────────────────

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
      'forked_from', room_row.forked_from
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

-- ── RPC: set_room_visibility ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_room_visibility(p_room_id uuid, p_visibility text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
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

  PERFORM set_config('app.toova_bypass_room_guards', '1', true);

  UPDATE public.rooms
  SET visibility = p_visibility,
      updated_at = now()
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

-- ── RPC: fork_public_room + refactor fork_shared_room ────────────────────────

CREATE OR REPLACE FUNCTION public.fork_public_room(
  p_handle text,
  p_room_id uuid,
  p_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  pid uuid;
  prof public.profiles%ROWTYPE;
  room_row public.rooms%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;

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
  FROM public.rooms
  WHERE id = p_room_id
    AND user_id = pid
    AND visibility = 'public';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN private.copy_room_as_fork(room_row.id, uid, p_name);
END;
$$;

REVOKE ALL ON FUNCTION public.fork_public_room(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fork_public_room(text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fork_public_room(text, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fork_shared_room(p_token text, p_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.room_shares%ROWTYPE;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'invalid share link'
      USING ERRCODE = 'P0001';
  END IF;

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

  IF NOT share_row.allow_copy THEN
    RAISE EXCEPTION 'copying is disabled for this link'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN private.copy_room_as_fork(share_row.room_id, uid, p_name);
END;
$$;

REVOKE ALL ON FUNCTION public.fork_shared_room(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fork_shared_room(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fork_shared_room(text, text) TO authenticated;

-- ── Update get_shared_room identity from profiles ────────────────────────────

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

  SELECT COALESCE(array_agg(g.object_path), '{}'::text[])
  INTO paths
  FROM public.share_asset_grants g
  WHERE g.token = p_token
    AND g.expires_at > now();

  RETURN jsonb_build_object(
    'room', jsonb_build_object(
      'id', room_row.id,
      'name', room_row.name,
      'environment', room_row.environment,
      'room_geometry', room_row.room_geometry,
      'fork_count', room_row.fork_count
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

-- ── Collaborator display names (owner-only) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_room_collaborator_profiles(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_room_owner(p_room_id) THEN
    RAISE EXCEPTION 'not room owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'user_id', c.user_id,
          'role', c.role,
          'added_via', c.added_via,
          'created_at', c.created_at,
          'display_name', COALESCE(p.display_name, 'Collaborator'),
          'handle', p.handle,
          'avatar_path', p.avatar_path,
          'is_public', COALESCE(p.is_public, false)
        )
        ORDER BY c.created_at DESC
      )
      FROM public.room_collaborators c
      LEFT JOIN public.profiles p ON p.id = c.user_id
      WHERE c.room_id = p_room_id
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_room_collaborator_profiles(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_room_collaborator_profiles(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_room_collaborator_profiles(uuid) TO authenticated;

-- ── Attribution helper for owned rooms ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_room_attribution(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  room_row public.rooms%ROWTYPE;
BEGIN
  IF NOT public.is_room_editor(p_room_id) THEN
    RAISE EXCEPTION 'not allowed'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO room_row FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'forked_from', room_row.forked_from,
    'fork_count', room_row.fork_count,
    'visibility', room_row.visibility,
    'attribution', private.public_attribution(room_row.forked_from)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_room_attribution(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_room_attribution(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_room_attribution(uuid) TO authenticated;

-- Lock down private helpers
REVOKE ALL ON FUNCTION private.sanitize_handle_base(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.allocate_unique_handle(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.resolve_profile_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.profile_public_identity(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.safe_owner_display(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.safe_owner_handle(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.room_preview_items(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.public_attribution(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.copy_room_as_fork(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.create_profile_for_user() FROM PUBLIC, anon, authenticated;

COMMIT;
