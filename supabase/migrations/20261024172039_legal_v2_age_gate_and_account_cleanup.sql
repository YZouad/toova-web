-- Legal v2: under-13 rejections that close the account, uploads gated on
-- current Terms, and helpers for full account erasure (delete-account edge
-- function + 15-minute sweep of rejected under-13 sign-ups). The document
-- version bump lives in legal_v2_document_versions so it ships with clients.

BEGIN;

-- ---------------------------------------------------------------------------
-- 2) Under-13 rejections. No FK so the row survives auth.users deletion and
--    the sweep can confirm cleanup; holds only the account UUID.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.age_gate_rejections (
  user_id uuid PRIMARY KEY,
  rejected_at timestamptz NOT NULL DEFAULT now(),
  cleaned_at timestamptz
);

ALTER TABLE public.age_gate_rejections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.age_gate_rejections FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.age_gate_rejections TO service_role;

CREATE OR REPLACE FUNCTION public.accept_legal_terms(
  p_terms_version text,
  p_privacy_version text,
  p_dob date,
  p_method text DEFAULT 'gate',
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  minor boolean;
  ua text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.age_gate_rejections WHERE user_id = uid) THEN
    RAISE EXCEPTION 'account closed' USING ERRCODE = 'P0001';
  END IF;

  IF p_terms_version IS DISTINCT FROM public.current_terms_version()
     OR p_privacy_version IS DISTINCT FROM public.current_privacy_version()
  THEN
    RAISE EXCEPTION 'stale legal document version' USING ERRCODE = '22023';
  END IF;

  IF p_dob IS NULL OR p_dob > current_date OR p_dob < DATE '1900-01-01' THEN
    RAISE EXCEPTION 'invalid date of birth' USING ERRCODE = '22023';
  END IF;

  IF p_method IS NULL OR p_method NOT IN ('signup_email', 'signup_oauth', 'gate', 'reaccept') THEN
    RAISE EXCEPTION 'invalid method' USING ERRCODE = '22023';
  END IF;

  -- Returning (not raising) so the rejection commits; the account is then
  -- erased by delete-account (client call or hourly sweep).
  IF NOT public.is_at_least_age(p_dob, 13) THEN
    INSERT INTO public.age_gate_rejections (user_id)
    VALUES (uid)
    ON CONFLICT (user_id) DO NOTHING;
    DELETE FROM public.user_agreements WHERE user_id = uid;
    RETURN jsonb_build_object('ok', false, 'error', 'underage');
  END IF;

  minor := NOT public.is_at_least_age(p_dob, 18);
  ua := nullif(left(trim(coalesce(p_user_agent, '')), 512), '');

  INSERT INTO public.user_agreements (
    user_id, terms_version, terms_accepted_at,
    privacy_version, privacy_accepted_at,
    date_of_birth, is_minor, updated_at
  )
  VALUES (
    uid, p_terms_version, now(),
    p_privacy_version, now(),
    p_dob, minor, now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET terms_version = EXCLUDED.terms_version,
        terms_accepted_at = EXCLUDED.terms_accepted_at,
        privacy_version = EXCLUDED.privacy_version,
        privacy_accepted_at = EXCLUDED.privacy_accepted_at,
        date_of_birth = EXCLUDED.date_of_birth,
        is_minor = EXCLUDED.is_minor,
        updated_at = now();

  INSERT INTO public.legal_acceptance_events (user_id, document, version, user_agent, method)
  VALUES
    (uid, 'terms', p_terms_version, ua, p_method),
    (uid, 'privacy', p_privacy_version, ua, p_method);

  RETURN jsonb_build_object(
    'ok', true,
    'is_minor', minor,
    'terms_version', p_terms_version,
    'privacy_version', p_privacy_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_own_legal_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  ua public.user_agreements%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.age_gate_rejections WHERE user_id = uid) THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'needs_acceptance', false,
      'closed', true,
      'is_minor', null,
      'current_terms_version', public.current_terms_version(),
      'current_privacy_version', public.current_privacy_version()
    );
  END IF;

  SELECT * INTO ua FROM public.user_agreements WHERE user_id = uid;

  IF ua.user_id IS NULL THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'needs_acceptance', true,
      'closed', false,
      'is_minor', null,
      'current_terms_version', public.current_terms_version(),
      'current_privacy_version', public.current_privacy_version()
    );
  END IF;

  RETURN jsonb_build_object(
    'accepted',
      ua.terms_version = public.current_terms_version()
      AND ua.privacy_version = public.current_privacy_version(),
    'needs_acceptance',
      ua.terms_version IS DISTINCT FROM public.current_terms_version()
      OR ua.privacy_version IS DISTINCT FROM public.current_privacy_version(),
    'closed', false,
    'is_minor', ua.is_minor,
    'terms_version', ua.terms_version,
    'privacy_version', ua.privacy_version,
    'current_terms_version', public.current_terms_version(),
    'current_privacy_version', public.current_privacy_version()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_legal_terms(text, text, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_legal_terms(text, text, date, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_own_legal_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_legal_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Uploads require current Terms acceptance (blocks accounts that skipped
--    or failed the age gate from sending photos anywhere).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS model_files_insert ON storage.objects;
CREATE POLICY model_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'model-files'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND (SELECT public.has_accepted_current_terms((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS model_thumbnails_insert ON storage.objects;
CREATE POLICY model_thumbnails_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'model-thumbnails'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND (SELECT public.has_accepted_current_terms((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS profile_avatars_insert ON storage.objects;
CREATE POLICY profile_avatars_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND (SELECT public.has_accepted_current_terms((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS project_media_insert_own ON storage.objects;
CREATE POLICY project_media_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND (SELECT public.has_accepted_current_terms((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS public_models_insert ON storage.objects;
CREATE POLICY public_models_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'public-models'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND (SELECT public.has_accepted_current_terms((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS room_thumbnails_insert ON storage.objects;
CREATE POLICY room_thumbnails_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'room-thumbnails'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND (SELECT public.has_accepted_current_terms((SELECT auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- 4) Account erasure helpers (service_role only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_user_storage_objects(p_uid uuid)
RETURNS TABLE (bucket_id text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE (storage.foldername(o.name))[1] = p_uid::text
     OR o.owner_id = p_uid::text;
$$;

-- True when any of the user's content is under a law-enforcement preservation
-- hold; erasure must wait until the hold expires.
CREATE OR REPLACE FUNCTION public.user_has_legal_hold(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.content_reports cr
    WHERE cr.target_owner_id = p_uid
      AND cr.preserve_until IS NOT NULL
      AND cr.preserve_until > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.pending_underage_cleanups(p_limit int DEFAULT 50)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.user_id
  FROM public.age_gate_rejections r
  WHERE r.cleaned_at IS NULL
  ORDER BY r.rejected_at
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$$;

CREATE OR REPLACE FUNCTION public.mark_underage_cleaned(p_uid uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.age_gate_rejections SET cleaned_at = now() WHERE user_id = p_uid;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'account_cleanup_secret'
  ) THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'account_cleanup_secret',
      'Shared secret for pg_cron → delete-account under-13 sweep'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.account_cleanup_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
  SELECT s.decrypted_secret
  FROM vault.decrypted_secrets s
  WHERE s.name = 'account_cleanup_secret'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.invoke_underage_account_sweep()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, extensions
AS $$
DECLARE
  req_id bigint;
  endpoint text;
  secret text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.age_gate_rejections WHERE cleaned_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  endpoint := nullif(current_setting('app.settings.delete_account_url', true), '');
  IF endpoint IS NULL THEN
    endpoint := 'https://xfifgtedssabneqlxbhf.supabase.co/functions/v1/delete-account';
  END IF;

  secret := public.account_cleanup_secret();
  IF secret IS NULL OR length(secret) < 16 THEN
    RAISE WARNING 'account_cleanup_secret missing — skipping under-13 sweep';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', secret
    ),
    body := jsonb_build_object('mode', 'underage_sweep')
  ) INTO req_id;

  RETURN req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_user_storage_objects(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_has_legal_hold(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pending_underage_cleanups(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_underage_cleaned(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_cleanup_secret() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoke_underage_account_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_storage_objects(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_has_legal_hold(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pending_underage_cleanups(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_underage_cleaned(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_cleanup_secret() TO service_role;
GRANT EXECUTE ON FUNCTION public.invoke_underage_account_sweep() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'toova-underage-account-sweep';
    PERFORM cron.schedule(
      'toova-underage-account-sweep',
      '*/15 * * * *',
      'SELECT public.invoke_underage_account_sweep();'
    );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
