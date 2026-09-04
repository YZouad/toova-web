-- Legal clickwrap acceptance + 13+ age gate.
-- DOB lives here (not on publicly-readable profiles).

BEGIN;

-- Current document versions — keep in sync with src/legal/documents.ts
CREATE OR REPLACE FUNCTION public.current_terms_version()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT '2026-09-04'::text $$;

CREATE OR REPLACE FUNCTION public.current_privacy_version()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT '2026-09-04'::text $$;

CREATE TABLE IF NOT EXISTS public.user_agreements (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  privacy_version text NOT NULL,
  privacy_accepted_at timestamptz NOT NULL,
  date_of_birth date NOT NULL,
  is_minor boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legal_acceptance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  document text NOT NULL,
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  method text NOT NULL,
  CONSTRAINT legal_acceptance_events_document_check CHECK (
    document = ANY (ARRAY['terms'::text, 'privacy'::text])
  ),
  CONSTRAINT legal_acceptance_events_method_check CHECK (
    method = ANY (ARRAY[
      'signup_email'::text,
      'signup_oauth'::text,
      'gate'::text,
      'reaccept'::text
    ])
  ),
  CONSTRAINT legal_acceptance_events_ua_len CHECK (
    user_agent IS NULL OR char_length(user_agent) <= 512
  )
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptance_events_user
  ON public.legal_acceptance_events (user_id, accepted_at DESC);

ALTER TABLE public.user_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptance_events ENABLE ROW LEVEL SECURITY;

-- Owner can read own agreement (no DOB exposed via profiles). Admins via RPC.
DROP POLICY IF EXISTS user_agreements_owner_select ON public.user_agreements;
CREATE POLICY user_agreements_owner_select ON public.user_agreements
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_agreements_no_write ON public.user_agreements;
CREATE POLICY user_agreements_no_write ON public.user_agreements
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS user_agreements_no_update ON public.user_agreements;
CREATE POLICY user_agreements_no_update ON public.user_agreements
  FOR UPDATE
  TO authenticated, anon
  USING (false);

DROP POLICY IF EXISTS user_agreements_no_delete ON public.user_agreements;
CREATE POLICY user_agreements_no_delete ON public.user_agreements
  FOR DELETE
  TO authenticated, anon
  USING (false);

DROP POLICY IF EXISTS legal_acceptance_events_owner_select ON public.legal_acceptance_events;
CREATE POLICY legal_acceptance_events_owner_select ON public.legal_acceptance_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS legal_acceptance_events_no_write ON public.legal_acceptance_events;
CREATE POLICY legal_acceptance_events_no_write ON public.legal_acceptance_events
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- Age helper: true if DOB is on or before the day the person turned 13.
CREATE OR REPLACE FUNCTION public.is_at_least_age(p_dob date, p_age int)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_dob IS NOT NULL
    AND p_age > 0
    AND p_dob <= (current_date - make_interval(years => p_age))::date;
$$;

CREATE OR REPLACE FUNCTION public.has_accepted_current_terms(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ok boolean;
BEGIN
  IF p_uid IS NULL THEN
    RETURN false;
  END IF;
  SELECT
    ua.terms_version = public.current_terms_version()
    AND ua.privacy_version = public.current_privacy_version()
  INTO ok
  FROM public.user_agreements ua
  WHERE ua.user_id = p_uid;
  RETURN coalesce(ok, false);
END;
$$;

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

  IF p_terms_version IS DISTINCT FROM public.current_terms_version()
     OR p_privacy_version IS DISTINCT FROM public.current_privacy_version()
  THEN
    RAISE EXCEPTION 'stale legal document version' USING ERRCODE = '22023';
  END IF;

  IF p_dob IS NULL OR p_dob > current_date OR p_dob < DATE '1900-01-01' THEN
    RAISE EXCEPTION 'invalid date of birth' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_at_least_age(p_dob, 13) THEN
    RAISE EXCEPTION 'must be at least 13 years old' USING ERRCODE = 'P0001';
  END IF;

  IF p_method IS NULL OR p_method NOT IN ('signup_email', 'signup_oauth', 'gate', 'reaccept') THEN
    RAISE EXCEPTION 'invalid method' USING ERRCODE = '22023';
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

  SELECT * INTO ua FROM public.user_agreements WHERE user_id = uid;

  IF ua.user_id IS NULL THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'needs_acceptance', true,
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
    'is_minor', ua.is_minor,
    'terms_version', ua.terms_version,
    'privacy_version', ua.privacy_version,
    'current_terms_version', public.current_terms_version(),
    'current_privacy_version', public.current_privacy_version()
    -- date_of_birth intentionally omitted from client payload
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_accepted_current_terms(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_legal_terms(text, text, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_own_legal_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_accepted_current_terms(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_legal_terms(text, text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_own_legal_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_at_least_age(date, int) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- Server backstop: require current Terms on publish / share create
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_catalog_visibility(p_kind text, p_visibility text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  profile_public boolean;
  q_at timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_visibility IS NULL OR p_visibility NOT IN ('private', 'unlisted', 'public') THEN
    RAISE EXCEPTION 'invalid visibility' USING ERRCODE = '22023';
  END IF;

  IF p_visibility IN ('public', 'unlisted')
     AND NOT public.has_accepted_current_terms(uid)
  THEN
    RAISE EXCEPTION 'accept Terms and Privacy Policy before publishing'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_visibility = 'public' THEN
    SELECT is_public INTO profile_public FROM public.profiles WHERE id = uid;
    IF coalesce(profile_public, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Make your profile public before listing models in the gallery.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT quarantined_at INTO q_at
  FROM public.furniture_catalog
  WHERE kind = p_kind AND user_id = uid AND is_builtin = false;

  IF q_at IS NOT NULL AND p_visibility = 'public' THEN
    RAISE EXCEPTION 'quarantined content cannot be made public'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.furniture_catalog
  SET visibility = p_visibility
  WHERE kind = p_kind
    AND user_id = uid
    AND is_builtin = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_room_visibility(p_room_id uuid, p_visibility text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  profile_public boolean;
  q_at timestamptz;
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

  IF p_visibility = 'public' AND NOT public.has_accepted_current_terms(uid) THEN
    RAISE EXCEPTION 'accept Terms and Privacy Policy before publishing'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_visibility = 'public' THEN
    SELECT coalesce(p.is_public, false) INTO profile_public
    FROM public.profiles p
    WHERE p.id = uid;

    IF NOT coalesce(profile_public, false) THEN
      RAISE EXCEPTION 'profile must be public to publish a room'
        USING ERRCODE = '42501';
    END IF;

    SELECT quarantined_at INTO q_at FROM public.rooms WHERE id = p_room_id;
    IF q_at IS NOT NULL THEN
      RAISE EXCEPTION 'quarantined content cannot be made public'
        USING ERRCODE = 'P0001';
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

-- Trigger: block share-link creation without current Terms
CREATE OR REPLACE FUNCTION public.trg_room_shares_require_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_accepted_current_terms(auth.uid())
  THEN
    RAISE EXCEPTION 'accept Terms and Privacy Policy before creating share links'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_shares_require_terms ON public.room_shares;
CREATE TRIGGER trg_room_shares_require_terms
  BEFORE INSERT ON public.room_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_room_shares_require_terms();

REVOKE ALL ON FUNCTION public.set_catalog_visibility(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_catalog_visibility(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_room_visibility(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_room_visibility(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_room_visibility(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
