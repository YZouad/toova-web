-- Retry-safe Stripe webhook state, durable purchase records, proportional
-- credit clawback with purchased-credit debt, and safer top-up idempotency.

-- ---------------------------------------------------------------------------
-- stripe_events: claim / complete / fail instead of insert-as-processed
-- ---------------------------------------------------------------------------

ALTER TABLE public.stripe_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processed',
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Existing rows were written only after the old handler finished (or were
-- permanently stuck). Treat them as processed so they are not re-run.
UPDATE public.stripe_events
SET
  status = 'processed',
  claimed_at = COALESCE(claimed_at, processed_at),
  updated_at = COALESCE(updated_at, processed_at, now())
WHERE status IS DISTINCT FROM 'processed'
   OR claimed_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stripe_events_status_chk'
      AND conrelid = 'public.stripe_events'::regclass
  ) THEN
    ALTER TABLE public.stripe_events
      ADD CONSTRAINT stripe_events_status_chk
      CHECK (status IN ('processing', 'processed', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stripe_events_attempt_count_chk'
      AND conrelid = 'public.stripe_events'::regclass
  ) THEN
    ALTER TABLE public.stripe_events
      ADD CONSTRAINT stripe_events_attempt_count_chk
      CHECK (attempt_count >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stripe_events_status_claimed
  ON public.stripe_events (status, claimed_at);

-- ---------------------------------------------------------------------------
-- Purchased-credit debt (clawback when spent credits cannot be removed)
-- ---------------------------------------------------------------------------

ALTER TABLE public.credit_wallets
  ADD COLUMN IF NOT EXISTS purchased_debt int NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'credit_wallets_purchased_debt_nonneg_chk'
      AND conrelid = 'public.credit_wallets'::regclass
  ) THEN
    ALTER TABLE public.credit_wallets
      ADD CONSTRAINT credit_wallets_purchased_debt_nonneg_chk
      CHECK (purchased_debt >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Durable purchase + refund accounting
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  checkout_session_id text NOT NULL UNIQUE,
  payment_intent_id text,
  amount_total_cents int NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  credits_granted int NOT NULL DEFAULT 0,
  credits_clawed_back int NOT NULL DEFAULT 0,
  amount_refunded_cents int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'fulfilled',
  ledger_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_purchases_kind_chk CHECK (
    kind IN ('topup_50', 'topup_150', 'topup_400', 'semester_pass')
    OR kind LIKE 'topup_%'
  ),
  CONSTRAINT billing_purchases_status_chk CHECK (
    status IN ('fulfilled', 'partially_refunded', 'refunded')
  ),
  CONSTRAINT billing_purchases_amounts_nonneg_chk CHECK (
    amount_total_cents >= 0
    AND credits_granted >= 0
    AND credits_clawed_back >= 0
    AND amount_refunded_cents >= 0
    AND credits_clawed_back <= credits_granted
    AND amount_refunded_cents <= amount_total_cents
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_purchases_payment_intent
  ON public.billing_purchases (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_purchases_user_created
  ON public.billing_purchases (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.billing_purchases (id) ON DELETE CASCADE,
  stripe_refund_id text NOT NULL UNIQUE,
  charge_id text,
  amount_cents int NOT NULL,
  credits_clawed int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'succeeded',
  ledger_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_refunds_amount_nonneg_chk CHECK (amount_cents >= 0),
  CONSTRAINT billing_refunds_credits_nonneg_chk CHECK (credits_clawed >= 0),
  CONSTRAINT billing_refunds_status_chk CHECK (
    status IN ('succeeded', 'failed', 'reversed')
  )
);

CREATE INDEX IF NOT EXISTS idx_billing_refunds_purchase
  ON public.billing_refunds (purchase_id, created_at DESC);

ALTER TABLE public.billing_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_refunds ENABLE ROW LEVEL SECURITY;

-- No client policies; service_role bypasses RLS.

-- ---------------------------------------------------------------------------
-- Event claim / complete / fail
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_stripe_event(
  p_event_id text,
  p_event_type text,
  p_stale_after_seconds int DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.stripe_events%ROWTYPE;
  v_stale interval := make_interval(secs => GREATEST(COALESCE(p_stale_after_seconds, 300), 30));
BEGIN
  IF p_event_id IS NULL OR length(trim(p_event_id)) = 0 THEN
    RAISE EXCEPTION 'missing event_id' USING ERRCODE = 'P0001';
  END IF;
  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RAISE EXCEPTION 'missing event_type' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.stripe_events (
    event_id, event_type, status, attempt_count, claimed_at, processed_at, updated_at
  )
  VALUES (
    trim(p_event_id),
    trim(p_event_type),
    'processing',
    1,
    now(),
    now(),
    now()
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'claimed', true,
      'status', v_row.status,
      'attempt_count', v_row.attempt_count
    );
  END IF;

  SELECT * INTO v_row
  FROM public.stripe_events
  WHERE event_id = trim(p_event_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stripe_events row missing after conflict' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.status = 'processed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'claimed', false,
      'duplicate', true,
      'status', v_row.status,
      'attempt_count', v_row.attempt_count
    );
  END IF;

  IF v_row.status = 'processing'
     AND v_row.claimed_at IS NOT NULL
     AND v_row.claimed_at > now() - v_stale
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'claimed', false,
      'in_flight', true,
      'status', v_row.status,
      'attempt_count', v_row.attempt_count
    );
  END IF;

  -- failed or stale processing: reclaim for retry
  UPDATE public.stripe_events
  SET
    event_type = trim(p_event_type),
    status = 'processing',
    attempt_count = attempt_count + 1,
    claimed_at = now(),
    last_error = NULL,
    updated_at = now()
  WHERE event_id = trim(p_event_id)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'claimed', true,
    'retried', true,
    'status', v_row.status,
    'attempt_count', v_row.attempt_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_event(text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text, text, int) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_stripe_event(p_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.stripe_events
  SET
    status = 'processed',
    processed_at = now(),
    last_error = NULL,
    updated_at = now()
  WHERE event_id = trim(p_event_id);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_stripe_event(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_stripe_event(text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_stripe_event(
  p_event_id text,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.stripe_events
  SET
    status = 'failed',
    last_error = left(COALESCE(p_error, 'handler error'), 2000),
    updated_at = now()
  WHERE event_id = trim(p_event_id)
    AND status IS DISTINCT FROM 'processed';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_processed');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fail_stripe_event(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_stripe_event(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Idempotent credit_topup with debt settlement
-- ---------------------------------------------------------------------------

-- Return type changes from void -> jsonb; REPLACE alone is not allowed.
DROP FUNCTION IF EXISTS public.credit_topup(uuid, int, text);

CREATE OR REPLACE FUNCTION public.credit_topup(
  p_uid uuid,
  p_credits int,
  p_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.credit_wallets%ROWTYPE;
  v_settle int;
  v_add int;
BEGIN
  IF p_uid IS NULL OR p_ref IS NULL OR length(trim(p_ref)) = 0 THEN
    RAISE EXCEPTION 'invalid credit_topup arguments' USING ERRCODE = 'P0001';
  END IF;
  IF p_credits <= 0 THEN
    RAISE EXCEPTION 'topup credits must be positive' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE ref = p_ref) THEN
    SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_uid;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'monthly_balance', COALESCE(v_wallet.monthly_balance, 0),
      'purchased_balance', COALESCE(v_wallet.purchased_balance, 0),
      'purchased_debt', COALESCE(v_wallet.purchased_debt, 0)
    );
  END IF;

  PERFORM public.ensure_credit_wallet(p_uid);
  SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_uid FOR UPDATE;

  v_settle := LEAST(COALESCE(v_wallet.purchased_debt, 0), p_credits);
  v_add := p_credits - v_settle;

  INSERT INTO public.credit_ledger (user_id, delta, bucket, reason, ref)
  VALUES (p_uid, p_credits, 'purchased', 'topup', p_ref);

  UPDATE public.credit_wallets
  SET
    purchased_balance = purchased_balance + v_add,
    purchased_debt = purchased_debt - v_settle,
    updated_at = now()
  WHERE user_id = p_uid
  RETURNING * INTO v_wallet;

  RETURN jsonb_build_object(
    'ok', true,
    'credits_granted', p_credits,
    'debt_settled', v_settle,
    'spendable_added', v_add,
    'monthly_balance', v_wallet.monthly_balance,
    'purchased_balance', v_wallet.purchased_balance,
    'purchased_debt', v_wallet.purchased_debt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_topup(uuid, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_topup(uuid, int, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Clawback helper: remove purchased credits, carry shortfall as debt
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.credit_clawback_purchase(
  p_uid uuid,
  p_credits int,
  p_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.credit_wallets%ROWTYPE;
  v_remove int;
  v_debt int;
BEGIN
  IF p_uid IS NULL OR p_ref IS NULL OR length(trim(p_ref)) = 0 THEN
    RAISE EXCEPTION 'invalid credit_clawback_purchase arguments' USING ERRCODE = 'P0001';
  END IF;
  IF p_credits < 0 THEN
    RAISE EXCEPTION 'clawback credits must be non-negative' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE ref = p_ref) THEN
    SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_uid;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'credits_removed', 0,
      'debt_added', 0,
      'purchased_balance', COALESCE(v_wallet.purchased_balance, 0),
      'purchased_debt', COALESCE(v_wallet.purchased_debt, 0)
    );
  END IF;

  IF p_credits = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'credits_removed', 0,
      'debt_added', 0
    );
  END IF;

  PERFORM public.ensure_credit_wallet(p_uid);
  SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_uid FOR UPDATE;

  v_remove := LEAST(v_wallet.purchased_balance, p_credits);
  v_debt := p_credits - v_remove;

  INSERT INTO public.credit_ledger (user_id, delta, bucket, reason, ref)
  VALUES (p_uid, -p_credits, 'purchased', 'clawback', p_ref);

  UPDATE public.credit_wallets
  SET
    purchased_balance = purchased_balance - v_remove,
    purchased_debt = purchased_debt + v_debt,
    updated_at = now()
  WHERE user_id = p_uid
  RETURNING * INTO v_wallet;

  RETURN jsonb_build_object(
    'ok', true,
    'credits_removed', v_remove,
    'debt_added', v_debt,
    'purchased_balance', v_wallet.purchased_balance,
    'purchased_debt', v_wallet.purchased_debt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_clawback_purchase(uuid, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_clawback_purchase(uuid, int, text) TO service_role;

-- Reverse a prior clawback (refund.failed)
CREATE OR REPLACE FUNCTION public.credit_restore_clawback(
  p_uid uuid,
  p_credits int,
  p_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.credit_wallets%ROWTYPE;
  v_settle int;
  v_add int;
BEGIN
  IF p_uid IS NULL OR p_ref IS NULL OR length(trim(p_ref)) = 0 THEN
    RAISE EXCEPTION 'invalid credit_restore_clawback arguments' USING ERRCODE = 'P0001';
  END IF;
  IF p_credits < 0 THEN
    RAISE EXCEPTION 'restore credits must be non-negative' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE ref = p_ref) THEN
    SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_uid;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'purchased_balance', COALESCE(v_wallet.purchased_balance, 0),
      'purchased_debt', COALESCE(v_wallet.purchased_debt, 0)
    );
  END IF;

  IF p_credits = 0 THEN
    RETURN jsonb_build_object('ok', true, 'credits_restored', 0, 'debt_settled', 0);
  END IF;

  PERFORM public.ensure_credit_wallet(p_uid);
  SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_uid FOR UPDATE;

  v_settle := LEAST(COALESCE(v_wallet.purchased_debt, 0), p_credits);
  v_add := p_credits - v_settle;

  INSERT INTO public.credit_ledger (user_id, delta, bucket, reason, ref)
  VALUES (p_uid, p_credits, 'purchased', 'refund', p_ref);

  UPDATE public.credit_wallets
  SET
    purchased_balance = purchased_balance + v_add,
    purchased_debt = purchased_debt - v_settle,
    updated_at = now()
  WHERE user_id = p_uid
  RETURNING * INTO v_wallet;

  RETURN jsonb_build_object(
    'ok', true,
    'credits_restored', p_credits,
    'debt_settled', v_settle,
    'spendable_added', v_add,
    'purchased_balance', v_wallet.purchased_balance,
    'purchased_debt', v_wallet.purchased_debt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_restore_clawback(uuid, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_restore_clawback(uuid, int, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Fulfill one-time Checkout purchases (top-ups + semester pass)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fulfill_checkout_purchase(
  p_uid uuid,
  p_kind text,
  p_checkout_session_id text,
  p_payment_intent_id text DEFAULT NULL,
  p_amount_total_cents int DEFAULT 0,
  p_currency text DEFAULT 'usd',
  p_credits int DEFAULT 0,
  p_grant_tier text DEFAULT NULL,
  p_grant_months int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.billing_purchases%ROWTYPE;
  v_purchase public.billing_purchases%ROWTYPE;
  v_ledger_ref text;
  v_end timestamptz;
  v_tier text;
  v_months int;
BEGIN
  IF p_uid IS NULL
     OR p_kind IS NULL OR length(trim(p_kind)) = 0
     OR p_checkout_session_id IS NULL OR length(trim(p_checkout_session_id)) = 0
  THEN
    RAISE EXCEPTION 'invalid fulfill_checkout_purchase arguments' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
  FROM public.billing_purchases
  WHERE checkout_session_id = trim(p_checkout_session_id);

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'purchase_id', v_existing.id,
      'credits_granted', v_existing.credits_granted,
      'kind', v_existing.kind
    );
  END IF;

  v_ledger_ref := 'stripe:checkout:' || trim(p_checkout_session_id);

  IF trim(p_kind) LIKE 'topup_%' THEN
    IF COALESCE(p_credits, 0) <= 0 THEN
      RAISE EXCEPTION 'topup requires positive credits' USING ERRCODE = 'P0001';
    END IF;

    PERFORM public.credit_topup(p_uid, p_credits, v_ledger_ref);

    INSERT INTO public.billing_purchases (
      user_id, kind, checkout_session_id, payment_intent_id,
      amount_total_cents, currency, credits_granted, ledger_ref, status
    )
    VALUES (
      p_uid,
      trim(p_kind),
      trim(p_checkout_session_id),
      NULLIF(trim(COALESCE(p_payment_intent_id, '')), ''),
      GREATEST(COALESCE(p_amount_total_cents, 0), 0),
      COALESCE(NULLIF(trim(p_currency), ''), 'usd'),
      p_credits,
      v_ledger_ref,
      'fulfilled'
    )
    RETURNING * INTO v_purchase;

    RETURN jsonb_build_object(
      'ok', true,
      'purchase_id', v_purchase.id,
      'credits_granted', v_purchase.credits_granted,
      'kind', v_purchase.kind
    );
  END IF;

  IF trim(p_kind) = 'semester_pass' THEN
    v_tier := COALESCE(NULLIF(trim(p_grant_tier), ''), 'pro');
    v_months := COALESCE(p_grant_months, 5);
    IF v_months <= 0 THEN
      RAISE EXCEPTION 'semester_pass grant_months must be positive' USING ERRCODE = 'P0001';
    END IF;

    v_end := now() + (v_months || ' months')::interval;

    INSERT INTO public.subscriptions (
      user_id, tier, status, stripe_subscription_id,
      current_period_end, cancel_at_period_end, source, updated_at
    )
    VALUES (
      p_uid, v_tier, 'active', NULL, v_end, false, 'semester_pass', now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      tier = EXCLUDED.tier,
      status = EXCLUDED.status,
      stripe_subscription_id = NULL,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = false,
      source = 'semester_pass',
      updated_at = now();

    PERFORM public.apply_subscription_period(p_uid, v_tier, v_end);

    INSERT INTO public.billing_purchases (
      user_id, kind, checkout_session_id, payment_intent_id,
      amount_total_cents, currency, credits_granted, ledger_ref, status,
      metadata
    )
    VALUES (
      p_uid,
      'semester_pass',
      trim(p_checkout_session_id),
      NULLIF(trim(COALESCE(p_payment_intent_id, '')), ''),
      GREATEST(COALESCE(p_amount_total_cents, 0), 0),
      COALESCE(NULLIF(trim(p_currency), ''), 'usd'),
      0,
      v_ledger_ref,
      'fulfilled',
      jsonb_build_object(
        'grant_tier', v_tier,
        'grant_months', v_months,
        'period_end', v_end
      )
    )
    RETURNING * INTO v_purchase;

    RETURN jsonb_build_object(
      'ok', true,
      'purchase_id', v_purchase.id,
      'kind', 'semester_pass',
      'period_end', v_end,
      'tier', v_tier
    );
  END IF;

  RAISE EXCEPTION 'unsupported checkout kind %', p_kind USING ERRCODE = 'P0001';
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.billing_purchases
    WHERE checkout_session_id = trim(p_checkout_session_id);
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'purchase_id', v_existing.id,
        'credits_granted', v_existing.credits_granted,
        'kind', v_existing.kind
      );
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_checkout_purchase(uuid, text, text, text, int, text, int, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_checkout_purchase(uuid, text, text, text, int, text, int, text, int)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Process Stripe refund against a recorded purchase (proportional + debt)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_purchase_refund(
  p_stripe_refund_id text,
  p_payment_intent_id text DEFAULT NULL,
  p_checkout_session_id text DEFAULT NULL,
  p_charge_id text DEFAULT NULL,
  p_amount_cents int DEFAULT 0,
  p_charge_amount_refunded_cents int DEFAULT NULL,
  p_fully_refunded boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.billing_purchases%ROWTYPE;
  v_refund public.billing_refunds%ROWTYPE;
  v_target_credits int;
  v_delta int;
  v_ledger_ref text;
  v_amount_refunded int;
  v_status text;
BEGIN
  IF p_stripe_refund_id IS NULL OR length(trim(p_stripe_refund_id)) = 0 THEN
    RAISE EXCEPTION 'missing stripe_refund_id' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_refund
  FROM public.billing_refunds
  WHERE stripe_refund_id = trim(p_stripe_refund_id);

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', v_refund.status,
      'credits_clawed', v_refund.credits_clawed,
      'purchase_id', v_refund.purchase_id
    );
  END IF;

  IF p_checkout_session_id IS NOT NULL AND length(trim(p_checkout_session_id)) > 0 THEN
    SELECT * INTO v_purchase
    FROM public.billing_purchases
    WHERE checkout_session_id = trim(p_checkout_session_id)
    FOR UPDATE;
  ELSIF p_payment_intent_id IS NOT NULL AND length(trim(p_payment_intent_id)) > 0 THEN
    SELECT * INTO v_purchase
    FROM public.billing_purchases
    WHERE payment_intent_id = trim(p_payment_intent_id)
    FOR UPDATE;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'purchase_not_found');
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'purchase_not_found');
  END IF;

  -- Semester pass: revoke on any refund of the purchase
  IF v_purchase.kind = 'semester_pass' THEN
    v_amount_refunded := LEAST(
      v_purchase.amount_total_cents,
      GREATEST(
        COALESCE(p_charge_amount_refunded_cents, v_purchase.amount_refunded_cents + GREATEST(COALESCE(p_amount_cents, 0), 0)),
        v_purchase.amount_refunded_cents
      )
    );
    v_status := CASE
      WHEN COALESCE(p_fully_refunded, false)
        OR v_amount_refunded >= v_purchase.amount_total_cents
        OR v_purchase.amount_total_cents = 0
      THEN 'refunded'
      ELSE 'partially_refunded'
    END;

    UPDATE public.subscriptions
    SET
      status = 'canceled',
      cancel_at_period_end = false,
      updated_at = now()
    WHERE user_id = v_purchase.user_id
      AND source = 'semester_pass'
      AND status IN ('active', 'trialing');

    v_ledger_ref := 'stripe:refund:' || trim(p_stripe_refund_id);

    INSERT INTO public.billing_refunds (
      purchase_id, stripe_refund_id, charge_id, amount_cents, credits_clawed, status, ledger_ref
    )
    VALUES (
      v_purchase.id,
      trim(p_stripe_refund_id),
      NULLIF(trim(COALESCE(p_charge_id, '')), ''),
      GREATEST(COALESCE(p_amount_cents, 0), 0),
      0,
      'succeeded',
      v_ledger_ref
    )
    RETURNING * INTO v_refund;

    UPDATE public.billing_purchases
    SET
      amount_refunded_cents = v_amount_refunded,
      status = v_status,
      updated_at = now()
    WHERE id = v_purchase.id;

    RETURN jsonb_build_object(
      'ok', true,
      'kind', 'semester_pass',
      'purchase_id', v_purchase.id,
      'credits_clawed', 0,
      'status', v_status
    );
  END IF;

  -- Top-up proportional clawback
  IF v_purchase.credits_granted <= 0 OR v_purchase.amount_total_cents <= 0 THEN
    v_target_credits := CASE WHEN COALESCE(p_fully_refunded, false) THEN v_purchase.credits_granted ELSE 0 END;
  ELSIF COALESCE(p_fully_refunded, false)
     OR COALESCE(p_charge_amount_refunded_cents, 0) >= v_purchase.amount_total_cents
  THEN
    v_target_credits := v_purchase.credits_granted;
    v_amount_refunded := v_purchase.amount_total_cents;
  ELSE
    v_amount_refunded := LEAST(
      v_purchase.amount_total_cents,
      GREATEST(
        COALESCE(p_charge_amount_refunded_cents, v_purchase.amount_refunded_cents + GREATEST(COALESCE(p_amount_cents, 0), 0)),
        v_purchase.amount_refunded_cents
      )
    );
    v_target_credits := floor(
      (v_purchase.credits_granted::numeric * v_amount_refunded::numeric)
      / v_purchase.amount_total_cents::numeric
    )::int;
  END IF;

  IF v_amount_refunded IS NULL THEN
    v_amount_refunded := LEAST(
      v_purchase.amount_total_cents,
      GREATEST(
        COALESCE(p_charge_amount_refunded_cents, v_purchase.amount_refunded_cents + GREATEST(COALESCE(p_amount_cents, 0), 0)),
        v_purchase.amount_refunded_cents
      )
    );
  END IF;

  v_delta := GREATEST(v_target_credits - v_purchase.credits_clawed_back, 0);
  v_ledger_ref := 'stripe:refund:' || trim(p_stripe_refund_id);

  IF v_delta > 0 THEN
    PERFORM public.credit_clawback_purchase(v_purchase.user_id, v_delta, v_ledger_ref);
  END IF;

  INSERT INTO public.billing_refunds (
    purchase_id, stripe_refund_id, charge_id, amount_cents, credits_clawed, status, ledger_ref
  )
  VALUES (
    v_purchase.id,
    trim(p_stripe_refund_id),
    NULLIF(trim(COALESCE(p_charge_id, '')), ''),
    GREATEST(COALESCE(p_amount_cents, 0), 0),
    v_delta,
    'succeeded',
    v_ledger_ref
  )
  RETURNING * INTO v_refund;

  v_status := CASE
    WHEN v_amount_refunded >= v_purchase.amount_total_cents
      OR (v_purchase.credits_clawed_back + v_delta) >= v_purchase.credits_granted
    THEN 'refunded'
    WHEN v_amount_refunded > 0 OR (v_purchase.credits_clawed_back + v_delta) > 0
    THEN 'partially_refunded'
    ELSE 'fulfilled'
  END;

  UPDATE public.billing_purchases
  SET
    credits_clawed_back = credits_clawed_back + v_delta,
    amount_refunded_cents = v_amount_refunded,
    status = v_status,
    updated_at = now()
  WHERE id = v_purchase.id;

  RETURN jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase.id,
    'credits_clawed', v_delta,
    'credits_clawed_total', v_purchase.credits_clawed_back + v_delta,
    'amount_refunded_cents', v_amount_refunded,
    'status', v_status
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_refund
    FROM public.billing_refunds
    WHERE stripe_refund_id = trim(p_stripe_refund_id);
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'status', v_refund.status,
        'credits_clawed', v_refund.credits_clawed,
        'purchase_id', v_refund.purchase_id
      );
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.process_purchase_refund(text, text, text, text, int, int, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_purchase_refund(text, text, text, text, int, int, boolean)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Reverse a processed refund (refund.failed)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reverse_purchase_refund(p_stripe_refund_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.billing_refunds%ROWTYPE;
  v_purchase public.billing_purchases%ROWTYPE;
  v_restore_ref text;
  v_status text;
BEGIN
  IF p_stripe_refund_id IS NULL OR length(trim(p_stripe_refund_id)) = 0 THEN
    RAISE EXCEPTION 'missing stripe_refund_id' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_refund
  FROM public.billing_refunds
  WHERE stripe_refund_id = trim(p_stripe_refund_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'refund_not_found');
  END IF;

  IF v_refund.status IN ('failed', 'reversed') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', v_refund.status
    );
  END IF;

  SELECT * INTO v_purchase
  FROM public.billing_purchases
  WHERE id = v_refund.purchase_id
  FOR UPDATE;

  v_restore_ref := 'stripe:refund:' || trim(p_stripe_refund_id) || ':restore';

  IF v_purchase.kind = 'semester_pass' THEN
    -- Best-effort: re-activate only if still the semester_pass row and period not expired
    UPDATE public.subscriptions
    SET
      status = 'active',
      updated_at = now()
    WHERE user_id = v_purchase.user_id
      AND source = 'semester_pass'
      AND status = 'canceled'
      AND current_period_end IS NOT NULL
      AND current_period_end > now();
  ELSIF v_refund.credits_clawed > 0 THEN
    PERFORM public.credit_restore_clawback(
      v_purchase.user_id,
      v_refund.credits_clawed,
      v_restore_ref
    );
  END IF;

  UPDATE public.billing_refunds
  SET status = 'reversed', updated_at = now()
  WHERE id = v_refund.id;

  UPDATE public.billing_purchases
  SET
    credits_clawed_back = GREATEST(credits_clawed_back - v_refund.credits_clawed, 0),
    amount_refunded_cents = GREATEST(amount_refunded_cents - v_refund.amount_cents, 0),
    updated_at = now()
  WHERE id = v_purchase.id
  RETURNING * INTO v_purchase;

  v_status := CASE
    WHEN v_purchase.amount_refunded_cents <= 0 AND v_purchase.credits_clawed_back <= 0 THEN 'fulfilled'
    WHEN v_purchase.amount_refunded_cents >= v_purchase.amount_total_cents
      OR v_purchase.credits_clawed_back >= v_purchase.credits_granted THEN 'refunded'
    ELSE 'partially_refunded'
  END;

  UPDATE public.billing_purchases
  SET status = v_status, updated_at = now()
  WHERE id = v_purchase.id;

  RETURN jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase.id,
    'credits_restored', v_refund.credits_clawed,
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_purchase_refund(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_purchase_refund(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Expose purchased_debt in billing snapshots
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_billing()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_ent jsonb;
  v_wallet public.credit_wallets%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM public.refresh_monthly_credits_if_due(v_uid);
  v_ent := public.get_entitlements(v_uid);

  SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = v_uid;
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'tier', v_ent->>'tier',
    'display_name', v_ent->>'display_name',
    'entitlements', v_ent,
    'monthly_balance', COALESCE(v_wallet.monthly_balance, (v_ent->>'monthly_credits')::int),
    'purchased_balance', COALESCE(v_wallet.purchased_balance, 0),
    'purchased_debt', COALESCE(v_wallet.purchased_debt, 0),
    'monthly_period_end', v_wallet.monthly_period_end,
    'subscription', CASE
      WHEN v_sub.user_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'status', v_sub.status,
        'source', v_sub.source,
        'current_period_end', v_sub.current_period_end,
        'cancel_at_period_end', v_sub.cancel_at_period_end
      )
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_billing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_billing() TO authenticated;

-- Patch admin overview billing.purchased_debt without rewriting the full body.
CREATE OR REPLACE FUNCTION public.get_admin_user_overview(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
  v_analytics jsonb;
  v_tier text;
  v_sub public.subscriptions%ROWTYPE;
  v_wallet public.credit_wallets%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_tier := public.get_effective_tier(p_user_id);
  PERFORM public.refresh_monthly_credits_if_due(p_user_id);
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = p_user_id;
  SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_user_id;
  v_analytics := public.get_admin_user_analytics(p_user_id, now() - interval '90 days', now());

  SELECT jsonb_build_object(
    'user', jsonb_build_object(
      'user_id', p.id,
      'email', au.email,
      'handle', p.handle,
      'display_name', p.display_name,
      'bio', p.bio,
      'avatar_path', p.avatar_path,
      'is_public', p.is_public,
      'created_at', p.created_at,
      'last_active_at', (
        SELECT MAX(ts)
        FROM (VALUES
          (p.last_active_at),
          (p.created_at),
          (au.last_sign_in_at),
          (rs.rooms_updated_at),
          (ms.models_at),
          (js.jobs_at)
        ) AS activity(ts)
      ),
      'last_sign_in_at', au.last_sign_in_at,
      'plan', v_tier,
      'is_admin', public.is_admin(p.id)
    ),
    'billing', jsonb_build_object(
      'effective_tier', v_tier,
      'monthly_balance', COALESCE(v_wallet.monthly_balance, 0),
      'purchased_balance', COALESCE(v_wallet.purchased_balance, 0),
      'purchased_debt', COALESCE(v_wallet.purchased_debt, 0),
      'monthly_period_end', v_wallet.monthly_period_end,
      'subscription', CASE
        WHEN v_sub.user_id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'tier', v_sub.tier,
          'status', v_sub.status,
          'source', v_sub.source,
          'current_period_end', v_sub.current_period_end,
          'cancel_at_period_end', v_sub.cancel_at_period_end,
          'has_stripe', v_sub.stripe_subscription_id IS NOT NULL
        )
      END
    ),
    'rooms', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'room_id', r.id,
          'name', r.name,
          'visibility', r.visibility,
          'item_count', COALESCE(ic.cnt, 0),
          'likes_count', COALESCE(r.likes_count, 0),
          'views_count', COALESCE(r.views_count, 0),
          'fork_count', COALESCE(r.fork_count, 0),
          'created_at', r.created_at,
          'updated_at', r.updated_at,
          'quarantined_at', r.quarantined_at,
          'thumbnail_path', r.thumbnail_path
        )
        ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC
      )
      FROM public.rooms AS r
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::bigint AS cnt
        FROM public.room_items AS ri
        WHERE ri.room_id = r.id
      ) AS ic ON true
      WHERE r.user_id = p.id
    ), '[]'::jsonb),
    'models', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'kind', fc.kind,
          'label', fc.label,
          'description', fc.description,
          'tags', COALESCE(fc.tags, '{}'::text[]),
          'categories', COALESCE(fc.categories, '{}'::text[]),
          'visibility', fc.visibility,
          'width_in', fc.width_in,
          'height_in', fc.height_in,
          'depth_in', fc.depth_in,
          'clearance_in', fc.clearance_in,
          'likes_count', COALESCE(fc.likes_count, 0),
          'downloads_count', COALESCE(fc.downloads_count, 0),
          'views_count', COALESCE(fc.views_count, 0),
          'created_at', fc.created_at,
          'model_url', fc.model_url,
          'thumbnail_path', fc.thumbnail_path,
          'quarantined_at', fc.quarantined_at
        )
        ORDER BY fc.created_at DESC NULLS LAST, fc.label ASC
      )
      FROM public.furniture_catalog AS fc
      WHERE fc.user_id = p.id
        AND fc.is_builtin = false
    ), '[]'::jsonb),
    'analytics', jsonb_build_object(
      'generated_at', now(),
      'totals', jsonb_build_object(
        'rooms', COALESCE(rs.room_count, 0),
        'models', COALESCE(ms.model_count, 0),
        'placements', COALESCE(rs.placements, 0),
        'generations', COALESCE(js.job_count, 0),
        'generations_completed', COALESCE(js.completed_count, 0),
        'generations_failed', COALESCE(js.failed_count, 0),
        'public_rooms', COALESCE(rs.public_rooms, 0),
        'public_models', COALESCE(ms.public_models, 0)
      ),
      'series', COALESCE(v_analytics->'series', '[]'::jsonb),
      'extras', COALESCE(v_analytics - 'series' - 'generated_at', '{}'::jsonb)
    )
  )
  INTO payload
  FROM public.profiles AS p
  LEFT JOIN auth.users AS au ON au.id = p.id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(DISTINCT r.id)::bigint AS room_count,
      COUNT(ri.id)::bigint AS placements,
      MAX(r.updated_at) AS rooms_updated_at,
      COUNT(DISTINCT r.id) FILTER (WHERE r.visibility = 'public')::bigint AS public_rooms
    FROM public.rooms AS r
    LEFT JOIN public.room_items AS ri ON ri.room_id = r.id
    WHERE r.user_id = p.id
  ) AS rs ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS model_count,
      MAX(fc.created_at) AS models_at,
      COUNT(*) FILTER (WHERE fc.visibility = 'public')::bigint AS public_models
    FROM public.furniture_catalog AS fc
    WHERE fc.user_id = p.id
      AND fc.is_builtin = false
  ) AS ms ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS job_count,
      COUNT(*) FILTER (WHERE j.status = 'completed')::bigint AS completed_count,
      COUNT(*) FILTER (WHERE j.status = 'failed')::bigint AS failed_count,
      MAX(j.updated_at) AS jobs_at
    FROM public.conversion_jobs AS j
    WHERE j.user_id = p.id
  ) AS js ON true
  WHERE p.id = p_user_id;

  RETURN payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_user_overview(uuid) TO authenticated;
