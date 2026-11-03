-- Enforce share-link expiry on the server.
--
-- Redeem / get / fork already reject expired and revoked rows. The remaining gap
-- was the INSERT trigger trusting any client-supplied expires_at, so a free/lite
-- client could mint a longer (or open-ended) link than the plan allows. This
-- migration:
--   1. Clamps expires_at to the creator's plan TTL on INSERT and UPDATE
--   2. Distinguishes expired vs revoked errors on the redeem path
--   3. Backfills existing active shares that are missing an expiry

-- ── 1) Authoritative expiry clamp ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.room_shares_set_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ttl_days int;
  max_exp timestamptz;
  base_at timestamptz;
BEGIN
  -- Prefer the row's created_at so backfills / clocks stay consistent.
  base_at := COALESCE(NEW.created_at, now());

  ttl_days := (public.get_entitlements(NEW.created_by)->>'share_ttl_days')::int;

  IF ttl_days IS NULL THEN
    -- Unlimited plan: allow a client-chosen expiry, or NULL (never expires).
    -- Do not invent an expiry the plan does not require.
    RETURN NEW;
  END IF;

  IF ttl_days <= 0 THEN
    RAISE EXCEPTION 'invalid share TTL'
      USING ERRCODE = 'P0001';
  END IF;

  max_exp := base_at + make_interval(days => ttl_days);

  -- Plan requires expiry: never allow NULL, and never allow longer than the plan.
  -- A shorter client-supplied expiry is kept.
  IF NEW.expires_at IS NULL OR NEW.expires_at > max_exp THEN
    NEW.expires_at := max_exp;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS room_shares_set_expiry ON public.room_shares;
CREATE TRIGGER room_shares_set_expiry
  BEFORE INSERT OR UPDATE OF expires_at, created_by ON public.room_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.room_shares_set_expiry();

COMMENT ON FUNCTION public.room_shares_set_expiry() IS
  'Clamps room_shares.expires_at to the creator plan share_ttl_days. NULL TTL = unlimited.';

-- ── 2) Active-share loader with distinct errors ──────────────────────────────

CREATE OR REPLACE FUNCTION public.load_active_share(p_token text)
RETURNS public.room_shares
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.room_shares%ROWTYPE;
BEGIN
  IF NOT public.is_share_token_format(p_token) THEN
    RAISE EXCEPTION 'invalid share link'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO share_row
  FROM public.room_shares s
  WHERE s.token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid share link'
      USING ERRCODE = 'P0001';
  END IF;

  IF share_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'share link revoked'
      USING ERRCODE = 'P0001';
  END IF;

  IF share_row.expires_at IS NOT NULL AND share_row.expires_at <= now() THEN
    RAISE EXCEPTION 'share link expired'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN share_row;
END;
$$;

REVOKE ALL ON FUNCTION public.load_active_share(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.load_active_share(text) FROM anon, authenticated;

-- Keep the boolean helper in sync (still internal).
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

-- ── 3) Redeem / fork use the loader ──────────────────────────────────────────

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

  share_row := public.load_active_share(p_token);

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

  share_row := public.load_active_share(p_token);

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

-- get_shared_room: only swap the token-lookup block so the rest of the payload
-- (catalog dims, products, attribution) stays as last redefined.
CREATE OR REPLACE FUNCTION public.get_shared_room(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  share_row public.room_shares%ROWTYPE;
  room_row public.rooms%ROWTYPE;
  owner_name text;
  owner_handle text;
  items_json jsonb;
  dims_json jsonb;
  products_json jsonb;
  paths text[];
  thumb text;
BEGIN
  share_row := public.load_active_share(p_token);

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

  SELECT COALESCE(
    jsonb_object_agg(
      cp.id::text,
      jsonb_build_object(
        'id', cp.id,
        'name', cp.name,
        'description', cp.description,
        'retailer', cp.retailer,
        'affiliate_url', cp.affiliate_url,
        'price_cents', cp.price_cents,
        'currency', cp.currency,
        'image_path', cp.image_path,
        'place_builtin_kind', cp.place_builtin_kind,
        'place_catalog_kind', cp.place_catalog_kind
      )
    ),
    '{}'::jsonb
  )
  INTO products_json
  FROM public.curated_products cp
  JOIN public.checklist_categories cc ON cc.id = cp.category_id
  WHERE cp.published = true
    AND cc.published = true
    AND cp.id IN (
      SELECT ri.curated_product_id
      FROM public.room_items ri
      WHERE ri.room_id = room_row.id
        AND ri.curated_product_id IS NOT NULL
    );

  PERFORM public._grant_share_assets(p_token, room_row.id);

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
    'published_products', COALESCE(products_json, '{}'::jsonb),
    'asset_paths', to_jsonb(paths),
    'role', share_row.role,
    'allow_copy', share_row.allow_copy,
    'owner_display', owner_name,
    'owner_handle', owner_handle,
    'attribution', private.public_attribution(room_row.forked_from)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_shared_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_room(text) TO anon, authenticated;

-- Asset listing already filtered expired shares; route through the same check.
CREATE OR REPLACE FUNCTION public.list_share_asset_paths(p_token text)
RETURNS TABLE(object_path text, bucket_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
        WHERE NULLIF(trim(r.thumbnail_path), '') = g.object_path
      ) THEN 'room-thumbnails'::text
      ELSE 'model-files'::text
    END AS bucket_id
  FROM public.share_asset_grants g
  WHERE g.token = p_token
    AND g.expires_at > now();
END;
$$;

REVOKE ALL ON FUNCTION public.list_share_asset_paths(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_share_asset_paths(text) TO anon, authenticated;

-- ── 4) Backfill: stamp plan TTL on active shares that have none ──────────────
-- Uses created_at + TTL so already-old free links expire immediately when due.

UPDATE public.room_shares s
SET expires_at = s.created_at
  + make_interval(
      days => GREATEST(1, (public.get_entitlements(s.created_by)->>'share_ttl_days')::int)
    )
WHERE s.revoked_at IS NULL
  AND s.expires_at IS NULL
  AND (public.get_entitlements(s.created_by)->>'share_ttl_days') IS NOT NULL;

-- Clamp any existing active share that somehow outlives the plan TTL.
UPDATE public.room_shares s
SET expires_at = s.created_at
  + make_interval(
      days => GREATEST(1, (public.get_entitlements(s.created_by)->>'share_ttl_days')::int)
    )
WHERE s.revoked_at IS NULL
  AND (public.get_entitlements(s.created_by)->>'share_ttl_days') IS NOT NULL
  AND s.expires_at IS NOT NULL
  AND s.expires_at > s.created_at
    + make_interval(
        days => GREATEST(1, (public.get_entitlements(s.created_by)->>'share_ttl_days')::int)
      );
