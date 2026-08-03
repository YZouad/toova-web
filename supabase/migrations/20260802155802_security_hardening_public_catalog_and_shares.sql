-- Security hardening: lock private model-files, keep public catalog browseable,
-- bind share asset access to share tokens, revoke dangerous RPC grants, harden feedback.
-- Gallery: public furniture_catalog rows remain readable; storage SELECT for those paths only.

-- ---------------------------------------------------------------------------
-- 1) Public catalog asset helper (gallery browse + place-in-room)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_public_catalog_asset(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.furniture_catalog fc
    WHERE fc.visibility = 'public'
      AND p_object_path IS NOT NULL
      AND length(trim(p_object_path)) > 0
      AND p_object_path !~* '^https?://'
      AND p_object_path !~* '^blob:'
      AND (
        NULLIF(trim(fc.model_url), '') = p_object_path
        OR NULLIF(trim(fc.usdz_path), '') = p_object_path
        OR NULLIF(trim(fc.thumbnail_path), '') = p_object_path
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_public_catalog_asset(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_public_catalog_asset(text) TO anon, authenticated;

-- Anon can read public catalog rows (gallery). Authenticated policy already allows public.
DROP POLICY IF EXISTS catalog_select_anon_public ON public.furniture_catalog;
CREATE POLICY catalog_select_anon_public ON public.furniture_catalog
  FOR SELECT
  TO anon
  USING (visibility = 'public');

GRANT SELECT ON TABLE public.furniture_catalog TO anon;

-- ---------------------------------------------------------------------------
-- 2) model-files storage: owner + public catalog + public room (NOT unbound shares)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS model_files_select ON storage.objects;
DROP POLICY IF EXISTS model_files_select_public_room ON storage.objects;
DROP POLICY IF EXISTS model_files_select_share_grant ON storage.objects;
DROP POLICY IF EXISTS model_files_select_public_catalog ON storage.objects;
DROP POLICY IF EXISTS model_files_update ON storage.objects;
DROP POLICY IF EXISTS model_files_delete ON storage.objects;

CREATE POLICY model_files_select_owner ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'model-files'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

CREATE POLICY model_files_select_public_catalog ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'model-files'
    AND public.has_public_catalog_asset(name)
  );

CREATE POLICY model_files_select_public_room ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'model-files'
    AND public.has_public_room_asset(name)
  );

CREATE POLICY model_files_update ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'model-files'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  )
  WITH CHECK (
    bucket_id = 'model-files'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

CREATE POLICY model_files_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'model-files'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

-- ---------------------------------------------------------------------------
-- 3) Share grants: token-bound helper (storage no longer uses path-only grants)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_share_asset_grant(p_object_path text, p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.share_asset_grants g
    JOIN public.room_shares s ON s.token = g.token
    WHERE g.object_path = p_object_path
      AND g.token = p_token
      AND g.expires_at > now()
      AND s.revoked_at IS NULL
      AND (s.expires_at IS NULL OR s.expires_at > now())
      AND public.is_share_token_format(p_token)
  );
$$;

-- Legacy single-arg form: always false (closes path-only bypass).
CREATE OR REPLACE FUNCTION public.has_share_asset_grant(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT false;
$$;

REVOKE ALL ON FUNCTION public.has_share_asset_grant(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_share_asset_grant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_share_asset_grant(text, text) TO anon, authenticated;
-- Keep single-arg executable for any leftover policy references; it returns false.
GRANT EXECUTE ON FUNCTION public.has_share_asset_grant(text) TO anon, authenticated;

-- Room thumbnails: owner + public only (share thumbs via sign-share-assets edge).
CREATE OR REPLACE FUNCTION public.has_room_thumbnail_access(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ((storage.foldername(p_object_path))[1] = ((SELECT auth.uid())::text))
    OR public.has_public_room_thumbnail(p_object_path);
$$;

-- Paths allowed for a live share token (used by edge signer).
CREATE OR REPLACE FUNCTION public.list_share_asset_paths(p_token text)
RETURNS TABLE(object_path text, bucket_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_share_token_format(p_token) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.room_shares s
    WHERE s.token = p_token
      AND s.revoked_at IS NULL
      AND (s.expires_at IS NULL OR s.expires_at > now())
  ) THEN
    RETURN;
  END IF;

  -- Refresh grants so listing matches current room assets.
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

-- ---------------------------------------------------------------------------
-- 4) Catalog engagement (likes / views / downloads) for public gallery
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_likes (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  model_kind text NOT NULL REFERENCES public.furniture_catalog (kind) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, model_kind)
);

ALTER TABLE public.catalog_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_likes_owner ON public.catalog_likes;
CREATE POLICY catalog_likes_owner ON public.catalog_likes
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_catalog_likes_kind ON public.catalog_likes (model_kind);

CREATE OR REPLACE FUNCTION public.set_catalog_visibility(p_kind text, p_visibility text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_visibility IS NULL OR p_visibility NOT IN ('private', 'unlisted', 'public') THEN
    RAISE EXCEPTION 'invalid visibility' USING ERRCODE = '22023';
  END IF;

  UPDATE public.furniture_catalog
  SET visibility = p_visibility
  WHERE kind = p_kind
    AND user_id = (SELECT auth.uid())
    AND is_builtin = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_catalog_like(p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  liked boolean;
  cnt bigint;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.furniture_catalog fc
    WHERE fc.kind = p_kind AND fc.visibility = 'public'
  ) THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_likes cl
    WHERE cl.user_id = uid AND cl.model_kind = p_kind
  ) THEN
    DELETE FROM public.catalog_likes
    WHERE user_id = uid AND model_kind = p_kind;
    liked := false;
  ELSE
    INSERT INTO public.catalog_likes (user_id, model_kind) VALUES (uid, p_kind);
    liked := true;
  END IF;

  SELECT count(*)::bigint INTO cnt
  FROM public.catalog_likes
  WHERE model_kind = p_kind;

  UPDATE public.furniture_catalog
  SET likes_count = cnt
  WHERE kind = p_kind;

  RETURN jsonb_build_object('liked', liked, 'likes_count', cnt);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_catalog_view(p_kind text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_count bigint;
BEGIN
  UPDATE public.furniture_catalog
  SET views_count = views_count + 1
  WHERE kind = p_kind
    AND visibility = 'public'
  RETURNING views_count INTO new_count;

  IF new_count IS NULL THEN
    RETURN 0;
  END IF;
  RETURN new_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_catalog_download(p_kind text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_count bigint;
  uid uuid := (SELECT auth.uid());
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.furniture_catalog
  SET downloads_count = downloads_count + 1
  WHERE kind = p_kind
    AND visibility = 'public'
  RETURNING downloads_count INTO new_count;

  IF new_count IS NULL THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_catalog_visibility(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.toggle_catalog_like(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_catalog_view(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_catalog_download(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_catalog_visibility(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_catalog_like(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_catalog_view(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_catalog_download(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Feedback: constrained insert + rate-limited RPC (anon landing kept)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS feedback_insert ON public.feedback;
CREATE POLICY feedback_insert ON public.feedback
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(trim(message)) BETWEEN 1 AND 4000
    AND char_length(coalesce(email, '')) <= 320
    AND char_length(coalesce(page_source, '')) <= 64
    AND char_length(coalesce(user_agent, '')) <= 512
    AND category = ANY (ARRAY['bug'::text, 'feedback'::text, 'other'::text])
    AND (user_id IS NULL OR user_id = (SELECT auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.submit_feedback(
  p_message text,
  p_category text,
  p_page_source text,
  p_email text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  new_id uuid;
  recent int;
BEGIN
  IF p_category IS NULL OR p_category NOT IN ('bug', 'feedback', 'other') THEN
    RAISE EXCEPTION 'invalid category' USING ERRCODE = '22023';
  END IF;
  IF p_message IS NULL OR char_length(trim(p_message)) < 1 OR char_length(trim(p_message)) > 4000 THEN
    RAISE EXCEPTION 'invalid message' USING ERRCODE = '22023';
  END IF;
  IF p_page_source IS NULL OR char_length(p_page_source) > 64 THEN
    RAISE EXCEPTION 'invalid page_source' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::int INTO recent
  FROM public.feedback f
  WHERE f.created_at > now() - interval '1 hour'
    AND (
      (uid IS NOT NULL AND f.user_id = uid)
      OR (
        uid IS NULL
        AND nullif(trim(coalesce(p_email, '')), '') IS NOT NULL
        AND lower(trim(f.email)) = lower(trim(p_email))
      )
    );

  IF recent >= 5 THEN
    RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.feedback (user_id, email, message, category, page_source, user_agent)
  VALUES (
    uid,
    nullif(trim(coalesce(p_email, '')), ''),
    trim(p_message),
    p_category,
    p_page_source,
    nullif(left(coalesce(p_user_agent, ''), 512), '')
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_feedback(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_feedback(text, text, text, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) USDZ automation secret + dispatch (no publishable-key auth)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'glb_to_usdz_automation'
  ) THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'glb_to_usdz_automation',
      'Shared secret for DB cron/trigger → glb-to-usdz edge automation'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_glb_to_usdz_automation(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets s
    WHERE s.name = 'glb_to_usdz_automation'
      AND s.decrypted_secret = p_secret
      AND p_secret IS NOT NULL
      AND length(p_secret) >= 32
  );
$$;

REVOKE ALL ON FUNCTION public.verify_glb_to_usdz_automation(text) FROM PUBLIC;
-- Callable only with service_role (edge). No grant to anon/authenticated.
GRANT EXECUTE ON FUNCTION public.verify_glb_to_usdz_automation(text) TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_glb_to_usdz_for(catalog_kind text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'vault'
AS $$
DECLARE
  catalog_row public.furniture_catalog%ROWTYPE;
  request_id bigint;
  automation_secret text;
BEGIN
  SELECT *
  INTO catalog_row
  FROM public.furniture_catalog
  WHERE kind = catalog_kind;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF COALESCE(catalog_row.model_url, '') = '' THEN
    RETURN NULL;
  END IF;

  IF COALESCE(catalog_row.usdz_path, '') <> '' THEN
    RETURN NULL;
  END IF;

  SELECT s.decrypted_secret
  INTO automation_secret
  FROM vault.decrypted_secrets s
  WHERE s.name = 'glb_to_usdz_automation'
  LIMIT 1;

  IF automation_secret IS NULL THEN
    RAISE WARNING 'glb-to-usdz automation secret missing';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := 'https://xfifgtedssabneqlxbhf.functions.supabase.co/glb-to-usdz',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-automation-secret', automation_secret
    ),
    body := jsonb_build_object(
      'catalog_kind', catalog_row.kind,
      'glb_path', catalog_row.model_url,
      'user_id', catalog_row.user_id
    ),
    timeout_milliseconds := 150000
  )
  INTO request_id;

  RETURN request_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'glb-to-usdz dispatch failed for %: %', catalog_kind, SQLERRM;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconvert_glb_to_usdz_for(catalog_kind text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net'
AS $$
DECLARE
  request_id bigint;
  updated_count integer;
BEGIN
  -- Admin-only when called from the API. Triggers/cron use service roles.
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.furniture_catalog
  SET usdz_path = NULL
  WHERE kind = catalog_kind
    AND COALESCE(model_url, '') <> '';

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count = 0 THEN
    RETURN NULL;
  END IF;

  SELECT public.invoke_glb_to_usdz_for(catalog_kind)
  INTO request_id;

  RETURN request_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Revoke dangerous client EXECUTE on internal / admin helpers
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.invoke_glb_to_usdz_for(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_glb_to_usdz_for(text) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.invoke_glb_to_usdz() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_glb_to_usdz() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.reconvert_glb_to_usdz_for(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconvert_glb_to_usdz_for(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconvert_glb_to_usdz_for(text) TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_inventory_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_inventory_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_inventory_stats() TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_room_item_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_room_item_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_room_item_counts() TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_user_item_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_user_item_totals() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_user_item_totals() TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_bundle_suggestions(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_bundle_suggestions(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_bundle_suggestions(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.get_item_usage_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_item_usage_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_item_usage_stats() TO authenticated;
