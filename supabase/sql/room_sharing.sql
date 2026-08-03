-- Room sharing: token links, collaborators, RPC gateway, time-limited asset grants.
-- Security: no anon SELECT on rooms/room_items/furniture_catalog; no open anon storage.
-- Anon asset access: get_shared_room inserts share_asset_grants; client createSignedUrl
-- succeeds only for those paths while the grant is live (token-gated unlock).
-- Run in Supabase → SQL Editor after room_layout_schema + related migrations.

BEGIN;

-- ── Enums / helpers ──────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.share_role AS ENUM ('viewer', 'editor');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.gen_share_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT rtrim(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_'), '=');
$$;

REVOKE ALL ON FUNCTION public.gen_share_token() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gen_share_token() FROM anon;
GRANT EXECUTE ON FUNCTION public.gen_share_token() TO authenticated;

-- ── rooms columns (Phase 2–4 prep; visibility stays private) ─────────────────

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS forked_from uuid REFERENCES public.rooms (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fork_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thumbnail_path text;

DO $$ BEGIN
  ALTER TABLE public.rooms
    ADD CONSTRAINT rooms_visibility_check
    CHECK (visibility IN ('private', 'unlisted', 'public'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Prevent collaborators (or bugs) from changing ownership.
CREATE OR REPLACE FUNCTION public.rooms_prevent_owner_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'room ownership cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rooms_prevent_owner_change ON public.rooms;
CREATE TRIGGER rooms_prevent_owner_change
  BEFORE UPDATE OF user_id ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.rooms_prevent_owner_change();

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.room_shares (
  token      text PRIMARY KEY DEFAULT public.gen_share_token(),
  room_id    uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  role       public.share_role NOT NULL DEFAULT 'viewer',
  allow_copy boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  view_count int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_room_shares_room_id ON public.room_shares (room_id);
CREATE INDEX IF NOT EXISTS idx_room_shares_active
  ON public.room_shares (room_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.room_collaborators (
  room_id uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role    public.share_role NOT NULL DEFAULT 'editor',
  added_via text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_collaborators_user
  ON public.room_collaborators (user_id);

-- Time-limited unlocks for anon createSignedUrl (paths only, after valid token).
CREATE TABLE IF NOT EXISTS public.share_asset_grants (
  object_path text NOT NULL,
  room_id     uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  token       text NOT NULL REFERENCES public.room_shares (token) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  PRIMARY KEY (token, object_path)
);

CREATE INDEX IF NOT EXISTS idx_share_asset_grants_path_exp
  ON public.share_asset_grants (object_path, expires_at);

-- ── Recursion-safe helpers ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_room_owner(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = rid
      AND r.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_room_editor(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_room_owner(rid)
      OR EXISTS (
        SELECT 1
        FROM public.room_collaborators c
        WHERE c.room_id = rid
          AND c.user_id = (SELECT auth.uid())
          AND c.role = 'editor'
      );
$$;

REVOKE ALL ON FUNCTION public.is_room_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_room_editor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_room_owner(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_room_editor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_room_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_room_editor(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_share_token_format(p_token text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_token IS NOT NULL
    AND length(p_token) BETWEEN 16 AND 32
    AND p_token ~ '^[A-Za-z0-9_-]+$';
$$;

CREATE OR REPLACE FUNCTION public.share_token_is_active(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_shares s
    WHERE s.token = p_token
      AND s.revoked_at IS NULL
      AND (s.expires_at IS NULL OR s.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.share_token_is_active(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.share_token_is_active(text) FROM anon, authenticated;

-- ── RLS: room_shares (owner only) ────────────────────────────────────────────

ALTER TABLE public.room_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_shares_owner_select ON public.room_shares;
DROP POLICY IF EXISTS room_shares_owner_insert ON public.room_shares;
DROP POLICY IF EXISTS room_shares_owner_update ON public.room_shares;
DROP POLICY IF EXISTS room_shares_owner_delete ON public.room_shares;

CREATE POLICY room_shares_owner_select ON public.room_shares
  FOR SELECT TO authenticated
  USING (public.is_room_owner(room_id));

CREATE POLICY room_shares_owner_insert ON public.room_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_room_owner(room_id)
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY room_shares_owner_update ON public.room_shares
  FOR UPDATE TO authenticated
  USING (public.is_room_owner(room_id))
  WITH CHECK (public.is_room_owner(room_id));

CREATE POLICY room_shares_owner_delete ON public.room_shares
  FOR DELETE TO authenticated
  USING (public.is_room_owner(room_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_shares TO authenticated;
REVOKE ALL ON public.room_shares FROM anon;

-- Defense in depth for legacy anon table grants on core tables
REVOKE ALL ON TABLE public.rooms FROM anon;
REVOKE ALL ON TABLE public.room_items FROM anon;
REVOKE ALL ON TABLE public.furniture_catalog FROM anon;

-- ── RLS: room_collaborators ──────────────────────────────────────────────────

ALTER TABLE public.room_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_collaborators_owner_select ON public.room_collaborators;
DROP POLICY IF EXISTS room_collaborators_self_select ON public.room_collaborators;
DROP POLICY IF EXISTS room_collaborators_owner_delete ON public.room_collaborators;

CREATE POLICY room_collaborators_owner_select ON public.room_collaborators
  FOR SELECT TO authenticated
  USING (public.is_room_owner(room_id));

CREATE POLICY room_collaborators_self_select ON public.room_collaborators
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY room_collaborators_owner_delete ON public.room_collaborators
  FOR DELETE TO authenticated
  USING (public.is_room_owner(room_id));

-- No direct INSERT for clients — only redeem_share_token (SECURITY DEFINER).

GRANT SELECT, DELETE ON public.room_collaborators TO authenticated;
REVOKE INSERT, UPDATE ON public.room_collaborators FROM authenticated;
REVOKE ALL ON public.room_collaborators FROM anon;

-- ── RLS: share_asset_grants (no direct client access) ────────────────────────

ALTER TABLE public.share_asset_grants ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated → deny all via RLS.
REVOKE ALL ON public.share_asset_grants FROM anon, authenticated;

-- ── Extend rooms / room_items for editors ────────────────────────────────────

DROP POLICY IF EXISTS rooms_editor_select ON public.rooms;
DROP POLICY IF EXISTS rooms_editor_update ON public.rooms;
DROP POLICY IF EXISTS room_items_editor_all ON public.room_items;

CREATE POLICY rooms_editor_select ON public.rooms
  FOR SELECT TO authenticated
  USING (public.is_room_editor(id));

CREATE POLICY rooms_editor_update ON public.rooms
  FOR UPDATE TO authenticated
  USING (public.is_room_editor(id))
  WITH CHECK (public.is_room_editor(id));
-- Ownership changes blocked by rooms_prevent_owner_change trigger.

-- Collaborators: mutate items for that room (save = delete-all + reinsert).
CREATE POLICY room_items_editor_all ON public.room_items
  FOR ALL TO authenticated
  USING (public.is_room_editor(room_id))
  WITH CHECK (public.is_room_editor(room_id));

-- Grant check must be SECURITY DEFINER: anon has no SELECT on share_asset_grants.
CREATE OR REPLACE FUNCTION public.has_share_asset_grant(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.share_asset_grants g
    WHERE g.object_path = p_object_path
      AND g.expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION public.has_share_asset_grant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_share_asset_grant(text) TO anon, authenticated;

-- ── Storage: grant-gated anon SELECT (not whole bucket) ──────────────────────

DROP POLICY IF EXISTS model_files_select_share_grant ON storage.objects;

CREATE POLICY model_files_select_share_grant ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'model-files'
    AND public.has_share_asset_grant(name)
  );

-- ── Internal: unlock assets for a token ──────────────────────────────────────

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
  ) paths
  WHERE path IS NOT NULL
    AND path !~* '^https?://'
    AND path !~* '^blob:';
END;
$$;

REVOKE ALL ON FUNCTION public._grant_share_assets(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._grant_share_assets(text, uuid) FROM anon, authenticated;

-- ── RPC: get_shared_room ─────────────────────────────────────────────────────

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

  SELECT COALESCE(NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''), 'Toova designer')
  INTO owner_name
  FROM auth.users u
  WHERE u.id = room_row.user_id;

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
      'room_geometry', room_row.room_geometry
    ),
    'items', items_json,
    'catalog_dims', COALESCE(dims_json, '{}'::jsonb),
    'asset_paths', to_jsonb(paths),
    'role', share_row.role,
    'allow_copy', share_row.allow_copy,
    'owner_display', COALESCE(owner_name, 'Toova designer')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_room(text) TO anon, authenticated;

-- ── RPC: redeem_share_token ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.redeem_share_token(p_token text)
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

  IF share_row.role = 'editor' THEN
    INSERT INTO public.room_collaborators (room_id, user_id, role, added_via)
    VALUES (share_row.room_id, uid, 'editor', p_token)
    ON CONFLICT (room_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          added_via = EXCLUDED.added_via;
  END IF;

  RETURN share_row.room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_share_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_share_token(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_share_token(text) TO authenticated;

-- ── RPC: fork_shared_room ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fork_shared_room(p_token text, p_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.room_shares%ROWTYPE;
  room_row public.rooms%ROWTYPE;
  uid uuid := auth.uid();
  new_id uuid;
  room_count int;
  copy_name text;
  max_rooms constant int := 5;
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

  SELECT * INTO room_row FROM public.rooms WHERE id = share_row.room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid share link'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::int INTO room_count
  FROM public.rooms
  WHERE user_id = uid;

  IF room_count >= max_rooms THEN
    RAISE EXCEPTION 'room limit reached (% rooms)', max_rooms
      USING ERRCODE = 'P0001';
  END IF;

  copy_name := COALESCE(NULLIF(trim(p_name), ''), room_row.name || ' (copy)');

  INSERT INTO public.rooms (
    user_id, name, environment, room_geometry, forked_from, visibility
  )
  VALUES (
    uid,
    copy_name,
    room_row.environment,
    room_row.room_geometry,
    room_row.id,
    'private'
  )
  RETURNING id INTO new_id;

  INSERT INTO public.room_items (
    room_id, kind, label,
    pos_x, pos_y, pos_z, rotation_y,
    size_w, size_h, size_d,
    bed_leg_height, natural_w, natural_h, natural_d,
    sort_order, model_url,
    bedding_enabled, blanket_color, blanket_texture_path,
    emitter
  )
  SELECT
    new_id, kind, label,
    pos_x, pos_y, pos_z, rotation_y,
    size_w, size_h, size_d,
    bed_leg_height, natural_w, natural_h, natural_d,
    sort_order, model_url,
    bedding_enabled, blanket_color, blanket_texture_path,
    emitter
  FROM public.room_items
  WHERE room_id = room_row.id
  ORDER BY sort_order;

  UPDATE public.rooms
  SET fork_count = fork_count + 1
  WHERE id = room_row.id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fork_shared_room(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fork_shared_room(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fork_shared_room(text, text) TO authenticated;

COMMIT;

-- ── Security checklist (run after applying; expect denials / generic errors) ─
-- 1. As anon: SELECT on rooms, room_items, furniture_catalog, room_shares → deny/empty
-- 2. As anon: storage download of a private path with no grant → deny
-- 3. As anon: get_shared_room(valid) → jsonb; then createSignedUrl on granted paths → ok
-- 4. As anon: get_shared_room(garbage/revoked) → 'invalid share link'
-- 5. As collaborator: UPDATE rooms / mutate room_items ok; DELETE rooms fail;
--    INSERT room_shares fail; UPDATE rooms.user_id fail (trigger)
-- 6. Owner DELETE room_collaborators → collaborator save fails
-- 7. fork_shared_room → new room.user_id = forker; source unchanged
