-- Only email users who signed up on/after lifecycle email launch.
-- Existing accounts keep in-app notifications; they are skipped for email_outbox.
-- Cutoff is hardcoded (hosted Postgres blocks ALTER DATABASE app.settings.* here).

CREATE OR REPLACE FUNCTION public.lifecycle_email_min_signup_at()
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT timestamptz '2026-10-06 00:38:30+00';
$$;

REVOKE ALL ON FUNCTION public.lifecycle_email_min_signup_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_email_min_signup_at() TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_lifecycle_email(
  p_user_id uuid,
  p_template text,
  p_idempotency_key text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eid uuid;
  prefs public.notification_prefs;
  is_minor boolean;
  signup_at timestamptz;
  min_signup timestamptz := public.lifecycle_email_min_signup_at();
BEGIN
  SELECT p.created_at INTO signup_at
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  -- Grandfather: no lifecycle email for pre-launch accounts.
  IF signup_at IS NULL OR signup_at < min_signup THEN
    RETURN NULL;
  END IF;

  prefs := public.ensure_notification_prefs(p_user_id);
  IF prefs.email_unsubscribed_all THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(ua.is_minor, false) INTO is_minor
  FROM public.user_agreements AS ua
  WHERE ua.user_id = p_user_id
  ORDER BY ua.terms_accepted_at DESC NULLS LAST
  LIMIT 1;

  -- Minors: transactional model_ready only.
  IF coalesce(is_minor, false) AND p_template <> 'model_ready' THEN
    RETURN NULL;
  END IF;

  IF p_template = 'room_liked' AND NOT prefs.email_likes THEN RETURN NULL; END IF;
  IF p_template = 'room_copied' AND NOT prefs.email_copies THEN RETURN NULL; END IF;
  IF p_template = 'model_ready' AND NOT prefs.email_model_ready THEN RETURN NULL; END IF;
  IF p_template = 'finish_room' AND NOT prefs.email_finish_room THEN RETURN NULL; END IF;
  IF p_template = 'credits_refreshed' AND NOT prefs.email_credits THEN RETURN NULL; END IF;
  IF p_template = 'move_in_countdown' AND NOT prefs.email_move_in THEN RETURN NULL; END IF;

  INSERT INTO public.email_outbox (user_id, template, idempotency_key, payload)
  VALUES (p_user_id, p_template, p_idempotency_key, coalesce(p_payload, '{}'::jsonb))
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING id INTO eid;
  RETURN eid;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_lifecycle_candidates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  finish_n int := 0;
  credits_n int := 0;
  movein_n int := 0;
  r record;
  item_count bigint;
  min_signup timestamptz := public.lifecycle_email_min_signup_at();
BEGIN
  -- Finish your room: signed up 24–48h ago (and after launch cutoff), fewer than 5 items.
  FOR r IN
    SELECT p.id
    FROM public.profiles AS p
    WHERE p.created_at >= min_signup
      AND p.created_at <= now() - interval '24 hours'
      AND p.created_at > now() - interval '48 hours'
  LOOP
    SELECT count(*) INTO item_count
    FROM public.room_items AS ri
    JOIN public.rooms AS rooms ON rooms.id = ri.room_id
    WHERE rooms.user_id = r.id;

    IF item_count < 5 THEN
      IF public.enqueue_lifecycle_email(
        r.id,
        'finish_room',
        'finish_room:' || r.id::text,
        jsonb_build_object('item_count', item_count)
      ) IS NOT NULL THEN
        finish_n := finish_n + 1;
      END IF;
    END IF;
  END LOOP;

  -- Credits refreshed: monthly period started in the last 25 hours (post-cutoff users only).
  FOR r IN
    SELECT w.user_id, w.monthly_balance, w.monthly_period_end
    FROM public.credit_wallets AS w
    JOIN public.profiles AS p ON p.id = w.user_id
    WHERE p.created_at >= min_signup
      AND w.monthly_period_end IS NOT NULL
      AND (w.monthly_period_end - interval '1 month') > now() - interval '25 hours'
      AND (w.monthly_period_end - interval '1 month') <= now()
      AND w.monthly_balance > 0
  LOOP
    IF public.enqueue_lifecycle_email(
      r.user_id,
      'credits_refreshed',
      'credits_refreshed:' || to_char(date_trunc('month', now()), 'YYYY-MM'),
      jsonb_build_object('monthly_balance', r.monthly_balance)
    ) IS NOT NULL THEN
      credits_n := credits_n + 1;
    END IF;
  END LOOP;

  -- Move-in countdown: weekly nudge for post-cutoff users with budget + open checklist.
  FOR r IN
    SELECT DISTINCT b.user_id, b.room_id, b.budget_cents
    FROM public.user_move_in_budget AS b
    JOIN public.profiles AS p ON p.id = b.user_id
    WHERE p.created_at >= min_signup
      AND coalesce(b.budget_cents, 0) > 0
      AND EXISTS (
        SELECT 1
        FROM public.user_checklist_progress AS cp
        WHERE cp.user_id = b.user_id
          AND cp.room_id IS NOT DISTINCT FROM b.room_id
          AND coalesce(cp.resolution, '') NOT IN ('have', 'skip')
      )
  LOOP
    IF public.enqueue_lifecycle_email(
      r.user_id,
      'move_in_countdown',
      'move_in_countdown:' || r.user_id::text || ':' || to_char(now(), 'IYYY-IW'),
      jsonb_build_object('room_id', r.room_id, 'budget_cents', r.budget_cents)
    ) IS NOT NULL THEN
      movein_n := movein_n + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'finish_room', finish_n,
    'credits_refreshed', credits_n,
    'move_in_countdown', movein_n
  );
END;
$$;

-- Drop any pending rows already queued for pre-cutoff accounts.
UPDATE public.email_outbox AS eo
SET
  status = 'skipped',
  error = 'pre_cutoff_user',
  sent_at = now()
WHERE eo.status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = eo.user_id
      AND p.created_at < public.lifecycle_email_min_signup_at()
  );
