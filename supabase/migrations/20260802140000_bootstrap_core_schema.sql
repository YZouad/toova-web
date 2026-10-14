-- Core schema applied manually on production before Aug 2026 migrations.
-- Required for fresh `supabase start` / CI db-tests.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Room layout schema for 3DVisSim — run once in YOUR Supabase project:
-- `room_items` stores placement/size; imported GLB URLs are not persisted in the DB here.
-- Tagging: use `furniture_catalog.tags` (text[]) per product kind — not per placed row.
-- Dashboard → SQL Editor → paste → Run.
-- Confirm this project matches 3DVisSim/src/lib/supabase.ts (same URL/key pair).

CREATE TABLE public.furniture_catalog (
  kind             text PRIMARY KEY,
  label            text NOT NULL,
  width_in         numeric NOT NULL,
  height_in        numeric NOT NULL,
  depth_in         numeric NOT NULL,
  clearance_in     numeric,
  is_builtin       boolean NOT NULL DEFAULT true,
  model_url        text,
  tags             text[] NOT NULL DEFAULT '{}'::text[]
);

INSERT INTO public.furniture_catalog (
  kind, label, width_in, height_in, depth_in, clearance_in, is_builtin, model_url, tags
) VALUES
  ('bed',        'Twin Bed',   38, 14, 75, 8,    true, null, '{}'::text[]),
  ('dresser',    'Dresser',    30, 32, 18, null,  true, null, '{}'::text[]),
  ('bookshelf',  'Bookshelf',  30, 32, 18, null,  true, null, '{}'::text[]),
  ('wardrobe',   'Wardrobe',   36, 72, 24, null,  true, null, '{}'::text[]),
  ('desk',       'Desk',       48, 30, 24, 28.5, true, null, '{}'::text[]),
  ('chair',      'Chair',      18, 36, 18, null,  true, null, '{}'::text[]),
  ('nightstand', 'Nightstand', 18, 24, 18, null,  true, null, '{}'::text[]);

CREATE TABLE public.rooms (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name           text NOT NULL DEFAULT 'My Room',
  sort_order     int NOT NULL DEFAULT 0,
  environment    jsonb DEFAULT NULL,
  room_geometry  jsonb DEFAULT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rooms_user_id ON public.rooms (user_id);
CREATE INDEX idx_rooms_user_updated ON public.rooms (user_id, updated_at DESC);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY rooms_owner ON public.rooms FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE TABLE public.room_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  kind            text NOT NULL,
  label           text NOT NULL,
  pos_x           numeric NOT NULL,
  pos_y           numeric NOT NULL,
  pos_z           numeric NOT NULL,
  rotation_y      numeric NOT NULL DEFAULT 0,
  size_w          numeric NOT NULL,
  size_h          numeric NOT NULL,
  size_d          numeric NOT NULL,
  bed_leg_height  numeric,
  natural_w       numeric,
  natural_h       numeric,
  natural_d       numeric,
  sort_order      int NOT NULL DEFAULT 0,
  model_url       text,
  bedding_enabled boolean NOT NULL DEFAULT false,
  blanket_color   text,
  blanket_texture_path text
);

CREATE INDEX idx_room_items_room_sort ON public.room_items (room_id, sort_order);

ALTER TABLE public.room_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY room_items_owner ON public.room_items FOR ALL
  USING (room_id IN (SELECT id FROM public.rooms WHERE user_id = (select auth.uid())))
  WITH CHECK (room_id IN (SELECT id FROM public.rooms WHERE user_id = (select auth.uid())));

ALTER TABLE public.furniture_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_read ON public.furniture_catalog FOR SELECT
  USING (auth.role() = 'authenticated'::text);

-- API access via publishable keys (authenticated JWT only for catalog mutations not needed).
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.furniture_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_items TO authenticated;

-- Prefer not exposing catalog dimensions to anon traffic.
REVOKE SELECT ON public.furniture_catalog FROM anon;

COMMIT;

-- Optional description + user-owned custom catalog rows.
-- Run after room_layout_schema.sql / furniture_catalog_tags.sql.

BEGIN;

ALTER TABLE public.furniture_catalog
  ADD COLUMN IF NOT EXISTS description text;

-- NULL for built-in rows; set for user uploads.
ALTER TABLE public.furniture_catalog
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

-- Built-in seeds keep user_id NULL.

DROP POLICY IF EXISTS catalog_read ON public.furniture_catalog;

-- Authenticated users see built-ins and their own uploads.
CREATE POLICY catalog_select ON public.furniture_catalog FOR SELECT
  TO authenticated
  USING (
    is_builtin = true
    OR user_id = (select auth.uid())
  );

CREATE POLICY catalog_user_insert ON public.furniture_catalog FOR INSERT
  TO authenticated
  WITH CHECK (
    is_builtin = false
    AND user_id = (select auth.uid())
    AND (select auth.uid()) IS NOT NULL
  );

GRANT INSERT ON public.furniture_catalog TO authenticated;

COMMIT;


CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  handle       text NOT NULL,
  display_name text NOT NULL,
  bio          text NOT NULL DEFAULT '',
  avatar_path  text,
  is_public    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_handle_format CHECK (handle ~ '^[a-z0-9_]{3,30}$'),
  CONSTRAINT profiles_display_name_len CHECK (char_length(trim(display_name)) BETWEEN 1 AND 60),
  CONSTRAINT profiles_bio_len CHECK (char_length(bio) <= 280)
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_unique ON public.profiles (handle);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Columns expected by room_sharing fork RPC (added later in timestamped migrations on prod).
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS environment jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS room_geometry jsonb DEFAULT NULL;

ALTER TABLE public.room_items
  ADD COLUMN IF NOT EXISTS tint_color text,
  ADD COLUMN IF NOT EXISTS finish_texture_path text,
  ADD COLUMN IF NOT EXISTS mattress_color text,
  ADD COLUMN IF NOT EXISTS top_color text,
  ADD COLUMN IF NOT EXISTS bedding_config jsonb,
  ADD COLUMN IF NOT EXISTS emitter jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS instance_key text,
  ADD COLUMN IF NOT EXISTS hanging_config jsonb;

UPDATE public.room_items
SET instance_key = id::text
WHERE instance_key IS NULL OR trim(instance_key) = '';

ALTER TABLE public.furniture_catalog
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS usdz_path text;

DO $$ BEGIN
  ALTER TABLE public.furniture_catalog
    ADD CONSTRAINT furniture_catalog_visibility_check
    CHECK (visibility IN ('private', 'unlisted', 'public'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

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
    UNION
    SELECT NULLIF(trim(ri.finish_texture_path), '') AS path
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
    tint_color, finish_texture_path, mattress_color, top_color,
    bedding_config,
    emitter, instance_key, hanging_config
  )
  SELECT
    new_id, kind, label,
    pos_x, pos_y, pos_z, rotation_y,
    size_w, size_h, size_d,
    bed_leg_height, natural_w, natural_h, natural_d,
    sort_order, model_url,
    bedding_enabled, blanket_color, blanket_texture_path,
    tint_color, finish_texture_path, mattress_color, top_color,
    bedding_config,
    emitter, instance_key, hanging_config
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



-- Feedback (manual SQL predates security hardening; DROP POLICY requires the table to exist).
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  email text,
  message text NOT NULL,
  category text NOT NULL DEFAULT 'bug',
  page_source text NOT NULL,
  user_agent text,
  CONSTRAINT feedback_category_check CHECK (category IN ('bug', 'feedback', 'other')),
  CONSTRAINT feedback_message_nonempty CHECK (char_length(trim(message)) > 0)
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_insert ON public.feedback;
CREATE POLICY feedback_insert ON public.feedback
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

GRANT INSERT ON public.feedback TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE
);

ALTER TABLE public.furniture_catalog
  ADD COLUMN IF NOT EXISTS likes_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS downloads_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count bigint NOT NULL DEFAULT 0;


-- Catalog engagement columns (harmless no-op if already present).
ALTER TABLE public.furniture_catalog
  ADD COLUMN IF NOT EXISTS likes_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS downloads_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count bigint NOT NULL DEFAULT 0;

-- Let signed-in users read only their own admin row.
ALTER TABLE IF EXISTS public.admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admins_self_lookup ON public.admins;

CREATE POLICY admins_self_lookup ON public.admins
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

GRANT SELECT ON TABLE public.admins TO authenticated;

-- Postgres rejects CREATE OR REPLACE when the OUT-parameter / return row type changes (SQLSTATE 42P13). Drop admin RPCs before redefining their RETURNS shape.
DROP FUNCTION IF EXISTS public.get_admin_inventory_stats();
DROP FUNCTION IF EXISTS public.get_admin_room_item_counts();
DROP FUNCTION IF EXISTS public.get_admin_user_item_totals();
DROP FUNCTION IF EXISTS public.get_admin_bundle_suggestions(integer);

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins AS a
    WHERE a.user_id = uid
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_admin_inventory_stats()
RETURNS TABLE (
  kind text,
  label text,
  tags text[],
  description text,
  in_room_count bigint,
  distinct_room_count bigint,
  likes_count bigint,
  downloads_count bigint,
  views_count bigint
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
  SELECT
    fc.kind AS kind,
    fc.label AS label,
    COALESCE(fc.tags, '{}'::text[]) AS tags,
    fc.description AS description,
    COALESCE(ri.cnt, 0::bigint)::bigint AS in_room_count,
    COALESCE(dr.cnt, 0::bigint)::bigint AS distinct_room_count,
    COALESCE(fc.likes_count, 0::bigint)::bigint AS likes_count,
    COALESCE(fc.downloads_count, 0::bigint)::bigint AS downloads_count,
    COALESCE(fc.views_count, 0::bigint)::bigint AS views_count
  FROM public.furniture_catalog AS fc
  LEFT JOIN (
    SELECT ri2.kind AS kind,
           COUNT(*)::bigint AS cnt
    FROM public.room_items AS ri2
    GROUP BY ri2.kind
  ) AS ri ON ri.kind = fc.kind
  LEFT JOIN (
    SELECT ri3.kind AS kind,
           COUNT(DISTINCT ri3.room_id)::bigint AS cnt
    FROM public.room_items AS ri3
    GROUP BY ri3.kind
  ) AS dr ON dr.kind = fc.kind
  ORDER BY COALESCE(fc.likes_count, 0::bigint) DESC NULLS LAST, fc.label ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_inventory_stats() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_inventory_stats() TO authenticated;

-- Pair-wise kinds that co-occur in the same room (read-only bundle hints for admins).
CREATE OR REPLACE FUNCTION public.get_admin_bundle_suggestions(p_min_room_cooccurrences int DEFAULT 2)
RETURNS TABLE (
  kind_a text,
  kind_b text,
  label_a text,
  label_b text,
  room_cooccurrence_count bigint
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
  WITH rk AS (
    SELECT DISTINCT ri.room_id, ri.kind
    FROM public.room_items AS ri
  ),
  pair_rows AS (
    SELECT a.room_id,
           a.kind AS kind_a,
           b.kind AS kind_b
    FROM rk AS a
    JOIN rk AS b ON b.room_id = a.room_id AND b.kind > a.kind
  ),
  agg AS (
    SELECT pr.kind_a,
           pr.kind_b,
           COUNT(*)::bigint AS room_cooccurrence_count
    FROM pair_rows AS pr
    GROUP BY pr.kind_a, pr.kind_b
    HAVING COUNT(*) >= p_min_room_cooccurrences
  )
  SELECT
    ag.kind_a,
    ag.kind_b,
    COALESCE(fca.label, ag.kind_a) AS label_a,
    COALESCE(fcb.label, ag.kind_b) AS label_b,
    ag.room_cooccurrence_count
  FROM agg AS ag
  LEFT JOIN public.furniture_catalog AS fca ON fca.kind = ag.kind_a
  LEFT JOIN public.furniture_catalog AS fcb ON fcb.kind = ag.kind_b
  ORDER BY ag.room_cooccurrence_count DESC, ag.kind_a ASC, ag.kind_b ASC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_bundle_suggestions(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_bundle_suggestions(integer) TO authenticated;

-- Per-room: how many placed items live in each room (+ owner profile).
DROP FUNCTION IF EXISTS public.get_admin_room_item_counts();

CREATE OR REPLACE FUNCTION public.get_admin_room_item_counts()
RETURNS TABLE (
  room_id uuid,
  room_name text,
  item_count bigint,
  owner_user_id uuid,
  owner_handle text,
  owner_display_name text,
  updated_at timestamptz
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
  SELECT
    r.id AS room_id,
    r.name AS room_name,
    COUNT(ri.id)::bigint AS item_count,
    r.user_id AS owner_user_id,
    p.handle AS owner_handle,
    p.display_name AS owner_display_name,
    r.updated_at AS updated_at
  FROM public.rooms AS r
  LEFT JOIN public.room_items AS ri ON ri.room_id = r.id
  LEFT JOIN public.profiles AS p ON p.id = r.user_id
  GROUP BY r.id, r.name, r.user_id, p.handle, p.display_name, r.updated_at
  ORDER BY item_count DESC, r.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_room_item_counts() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_room_item_counts() TO authenticated;

-- Per-account: distinct rooms owned and total placed items across all their rooms.
DROP FUNCTION IF EXISTS public.get_admin_user_item_totals();

CREATE OR REPLACE FUNCTION public.get_admin_user_item_totals()
RETURNS TABLE (
  user_id uuid,
  handle text,
  display_name text,
  room_count bigint,
  total_item_placements bigint
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
  SELECT
    r.user_id AS user_id,
    p.handle AS handle,
    p.display_name AS display_name,
    COUNT(DISTINCT r.id)::bigint AS room_count,
    COUNT(ri.id)::bigint AS total_item_placements
  FROM public.rooms AS r
  LEFT JOIN public.room_items AS ri ON ri.room_id = r.id
  LEFT JOIN public.profiles AS p ON p.id = r.user_id
  GROUP BY r.user_id, p.handle, p.display_name
  ORDER BY total_item_placements DESC, room_count DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_item_totals() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_user_item_totals() TO authenticated;

COMMENT ON FUNCTION public.is_admin(uuid) IS
  'Returns true iff uid appears in public.admins. SECURITY DEFINER; not granted to callers by default.';
COMMENT ON FUNCTION public.get_admin_inventory_stats() IS
  'Admin-only: catalog row + placement count + distinct rooms with item + catalog likes/downloads/views.';
COMMENT ON FUNCTION public.get_admin_bundle_suggestions(integer) IS
  'Admin-only: pair kinds that co-occur in at least p_min_room_cooccurrences rooms (max 100 rows).';
COMMENT ON FUNCTION public.get_admin_room_item_counts() IS
  'Admin-only: rooms with placed item totals, owner profile, and updated_at.';
COMMENT ON FUNCTION public.get_admin_user_item_totals() IS
  'Admin-only: per auth user — room count, placements, profile handle and display name.';


-- Legacy helpers referenced only by REVOKE grants in security hardening.
CREATE OR REPLACE FUNCTION public.get_item_usage_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_glb_to_usdz()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL;
END;
$$;


-- Stubs replaced by security hardening + later migrations.
CREATE OR REPLACE FUNCTION public.has_public_catalog_asset(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT false; $$;

CREATE OR REPLACE FUNCTION public.has_public_room_asset(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT false; $$;

CREATE OR REPLACE FUNCTION public.has_public_room_thumbnail(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT false; $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('model-files', 'model-files', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
