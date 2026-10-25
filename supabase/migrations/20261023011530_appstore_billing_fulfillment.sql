-- App Store IAP: product map, extended transactions, notification idempotency,
-- fulfillment / revoke RPCs (mirrors Stripe webhook patterns).

-- ---------------------------------------------------------------------------
-- Product ID → entitlement mapping
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.appstore_products (
  product_id text PRIMARY KEY,
  kind text NOT NULL,
  tier text REFERENCES public.plans (tier),
  credits_amount int,
  grant_months int,
  display_name text NOT NULL,
  published boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appstore_products_kind_chk CHECK (
    kind IN ('subscription', 'topup', 'semester_pass')
  ),
  CONSTRAINT appstore_products_credits_chk CHECK (
    credits_amount IS NULL OR credits_amount > 0
  ),
  CONSTRAINT appstore_products_months_chk CHECK (
    grant_months IS NULL OR grant_months > 0
  ),
  CONSTRAINT appstore_products_shape_chk CHECK (
    (kind = 'subscription' AND tier IS NOT NULL AND credits_amount IS NULL)
    OR (kind = 'topup' AND credits_amount IS NOT NULL AND tier IS NULL)
    OR (kind = 'semester_pass' AND tier IS NOT NULL AND grant_months IS NOT NULL AND credits_amount IS NULL)
  )
);

ALTER TABLE public.appstore_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appstore_products_read_published ON public.appstore_products;
CREATE POLICY appstore_products_read_published ON public.appstore_products
  FOR SELECT TO authenticated, anon
  USING (published = true);

INSERT INTO public.appstore_products (
  product_id, kind, tier, credits_amount, grant_months, display_name, sort_order
) VALUES
  ('net.toova.lite.monthly', 'subscription', 'lite', NULL, NULL, 'Lite Monthly', 0),
  ('net.toova.lite.yearly', 'subscription', 'lite', NULL, NULL, 'Lite Yearly', 1),
  ('net.toova.pro.monthly', 'subscription', 'pro', NULL, NULL, 'Pro Monthly', 2),
  ('net.toova.pro.yearly', 'subscription', 'pro', NULL, NULL, 'Pro Yearly', 3),
  ('net.toova.credits.50', 'topup', NULL, 50, NULL, '50 Credits', 10),
  ('net.toova.credits.150', 'topup', NULL, 150, NULL, '150 Credits', 11),
  ('net.toova.credits.400', 'topup', NULL, 400, NULL, '400 Credits', 12),
  ('net.toova.semester.pass', 'semester_pass', 'pro', NULL, 5, 'Semester Pass', 20)
ON CONFLICT (product_id) DO UPDATE SET
  kind = EXCLUDED.kind,
  tier = EXCLUDED.tier,
  credits_amount = EXCLUDED.credits_amount,
  grant_months = EXCLUDED.grant_months,
  display_name = EXCLUDED.display_name,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Extend subscriptions for App Store
-- ---------------------------------------------------------------------------

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_source_chk;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_source_chk CHECK (
    source IN ('subscription', 'semester_pass', 'admin', 'app_store')
  );

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS appstore_original_transaction_id text;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_appstore_original_txn_uidx
  ON public.subscriptions (appstore_original_transaction_id)
  WHERE appstore_original_transaction_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Extend appstore_transactions
-- ---------------------------------------------------------------------------

ALTER TABLE public.appstore_transactions
  ADD COLUMN IF NOT EXISTS original_transaction_id text,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS app_account_token uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'fulfilled',
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appstore_transactions_status_chk'
      AND conrelid = 'public.appstore_transactions'::regclass
  ) THEN
    ALTER TABLE public.appstore_transactions
      ADD CONSTRAINT appstore_transactions_status_chk CHECK (
        status IN ('fulfilled', 'revoked', 'expired')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS appstore_transactions_user_idx
  ON public.appstore_transactions (user_id, purchased_at DESC);

CREATE INDEX IF NOT EXISTS appstore_transactions_original_idx
  ON public.appstore_transactions (original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Notification idempotency (Stripe claim pattern)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.appstore_notifications (
  notification_uuid text PRIMARY KEY,
  notification_type text NOT NULL,
  subtype text,
  status text NOT NULL DEFAULT 'processing',
  attempt_count int NOT NULL DEFAULT 1,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appstore_notifications_status_chk CHECK (
    status IN ('processing', 'processed', 'failed')
  )
);

ALTER TABLE public.appstore_notifications ENABLE ROW LEVEL SECURITY;
-- No client policies; service_role only.

CREATE OR REPLACE FUNCTION public.claim_appstore_notification(
  p_notification_uuid text,
  p_notification_type text,
  p_subtype text DEFAULT NULL,
  p_stale_after_seconds int DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.appstore_notifications%ROWTYPE;
  v_stale interval := make_interval(secs => GREATEST(COALESCE(p_stale_after_seconds, 300), 30));
BEGIN
  IF p_notification_uuid IS NULL OR length(trim(p_notification_uuid)) = 0 THEN
    RAISE EXCEPTION 'missing notification_uuid' USING ERRCODE = 'P0001';
  END IF;
  IF p_notification_type IS NULL OR length(trim(p_notification_type)) = 0 THEN
    RAISE EXCEPTION 'missing notification_type' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.appstore_notifications (
    notification_uuid, notification_type, subtype, status, attempt_count, claimed_at, updated_at
  )
  VALUES (
    trim(p_notification_uuid),
    trim(p_notification_type),
    NULLIF(trim(COALESCE(p_subtype, '')), ''),
    'processing',
    1,
    now(),
    now()
  )
  ON CONFLICT (notification_uuid) DO NOTHING
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
  FROM public.appstore_notifications
  WHERE notification_uuid = trim(p_notification_uuid)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appstore_notifications row missing after conflict' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.status = 'processed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'claimed', false,
      'duplicate', true,
      'status', v_row.status
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
      'status', v_row.status
    );
  END IF;

  UPDATE public.appstore_notifications
  SET
    notification_type = trim(p_notification_type),
    subtype = NULLIF(trim(COALESCE(p_subtype, '')), ''),
    status = 'processing',
    attempt_count = attempt_count + 1,
    claimed_at = now(),
    last_error = NULL,
    updated_at = now()
  WHERE notification_uuid = trim(p_notification_uuid)
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

REVOKE ALL ON FUNCTION public.claim_appstore_notification(text, text, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_appstore_notification(text, text, text, int)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_appstore_notification(p_notification_uuid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.appstore_notifications
  SET
    status = 'processed',
    processed_at = now(),
    last_error = NULL,
    updated_at = now()
  WHERE notification_uuid = trim(p_notification_uuid);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_appstore_notification(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_appstore_notification(text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_appstore_notification(
  p_notification_uuid text,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.appstore_notifications
  SET
    status = 'failed',
    last_error = left(COALESCE(p_error, 'handler error'), 2000),
    updated_at = now()
  WHERE notification_uuid = trim(p_notification_uuid)
    AND status IS DISTINCT FROM 'processed';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_processed');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fail_appstore_notification(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_appstore_notification(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Apple auth refresh tokens (for revoke-on-delete)
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.apple_auth_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.upsert_apple_auth_token(
  p_uid uuid,
  p_refresh_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF p_uid IS NULL OR p_refresh_token IS NULL OR length(trim(p_refresh_token)) = 0 THEN
    RAISE EXCEPTION 'invalid apple auth token args' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO private.apple_auth_tokens (user_id, refresh_token, updated_at)
  VALUES (p_uid, trim(p_refresh_token), now())
  ON CONFLICT (user_id) DO UPDATE SET
    refresh_token = EXCLUDED.refresh_token,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_apple_auth_token(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_apple_auth_token(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.take_apple_auth_token(p_uid uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_token text;
BEGIN
  DELETE FROM private.apple_auth_tokens
  WHERE user_id = p_uid
  RETURNING refresh_token INTO v_token;
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.take_apple_auth_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_apple_auth_token(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Fulfill a verified App Store transaction
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.appstore_fulfill_transaction(
  p_uid uuid,
  p_transaction_id text,
  p_original_transaction_id text,
  p_product_id text,
  p_environment text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_app_account_token uuid DEFAULT NULL,
  p_purchased_at timestamptz DEFAULT NULL,
  p_raw jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.appstore_transactions%ROWTYPE;
  v_product public.appstore_products%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_ledger_ref text;
  v_end timestamptz;
  v_tier text;
  v_months int;
BEGIN
  IF p_uid IS NULL
     OR p_transaction_id IS NULL OR length(trim(p_transaction_id)) = 0
     OR p_product_id IS NULL OR length(trim(p_product_id)) = 0
  THEN
    RAISE EXCEPTION 'invalid appstore_fulfill_transaction arguments' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
  FROM public.appstore_transactions
  WHERE transaction_id = trim(p_transaction_id);

  IF FOUND THEN
    IF v_existing.user_id <> p_uid THEN
      RAISE EXCEPTION 'transaction already owned by another user' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'transaction_id', v_existing.transaction_id,
      'kind', v_existing.kind,
      'status', v_existing.status
    );
  END IF;

  -- appAccountToken must match caller when present
  IF p_app_account_token IS NOT NULL AND p_app_account_token <> p_uid THEN
    RAISE EXCEPTION 'app_account_token mismatch' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_product
  FROM public.appstore_products
  WHERE product_id = trim(p_product_id) AND published = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown app store product %', p_product_id USING ERRCODE = 'P0001';
  END IF;

  -- Block double-billing: active Stripe/admin subscription vs App Store subscription/pass
  IF v_product.kind IN ('subscription', 'semester_pass') THEN
    SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = p_uid;
    IF FOUND
       AND v_sub.status IN ('active', 'trialing')
       AND (v_sub.current_period_end IS NULL OR v_sub.current_period_end > now())
       AND v_sub.source IS DISTINCT FROM 'app_store'
       AND v_sub.source IS DISTINCT FROM 'semester_pass'
    THEN
      RAISE EXCEPTION 'active subscription managed on another platform'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_ledger_ref := 'appstore:txn:' || trim(p_transaction_id);

  IF v_product.kind = 'topup' THEN
    PERFORM public.credit_topup(p_uid, v_product.credits_amount, v_ledger_ref);

    INSERT INTO public.appstore_transactions (
      transaction_id, user_id, product_id, purchased_at, raw,
      original_transaction_id, environment, expires_at, app_account_token,
      status, kind, updated_at
    ) VALUES (
      trim(p_transaction_id),
      p_uid,
      trim(p_product_id),
      COALESCE(p_purchased_at, now()),
      p_raw,
      NULLIF(trim(COALESCE(p_original_transaction_id, '')), ''),
      NULLIF(trim(COALESCE(p_environment, '')), ''),
      NULL,
      p_app_account_token,
      'fulfilled',
      'topup',
      now()
    );

    RETURN jsonb_build_object(
      'ok', true,
      'kind', 'topup',
      'credits_granted', v_product.credits_amount,
      'transaction_id', trim(p_transaction_id)
    );
  END IF;

  IF v_product.kind = 'semester_pass' THEN
    v_tier := COALESCE(v_product.tier, 'pro');
    v_months := COALESCE(v_product.grant_months, 5);
    v_end := COALESCE(p_expires_at, now() + (v_months || ' months')::interval);

    INSERT INTO public.subscriptions (
      user_id, tier, status, stripe_subscription_id,
      current_period_end, cancel_at_period_end, source,
      appstore_original_transaction_id, updated_at
    )
    VALUES (
      p_uid, v_tier, 'active', NULL,
      v_end, false, 'app_store',
      NULLIF(trim(COALESCE(p_original_transaction_id, p_transaction_id)), ''),
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      tier = EXCLUDED.tier,
      status = EXCLUDED.status,
      stripe_subscription_id = NULL,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = false,
      source = 'app_store',
      appstore_original_transaction_id = EXCLUDED.appstore_original_transaction_id,
      updated_at = now();

    PERFORM public.apply_subscription_period(p_uid, v_tier, v_end);

    INSERT INTO public.appstore_transactions (
      transaction_id, user_id, product_id, purchased_at, raw,
      original_transaction_id, environment, expires_at, app_account_token,
      status, kind, updated_at
    ) VALUES (
      trim(p_transaction_id),
      p_uid,
      trim(p_product_id),
      COALESCE(p_purchased_at, now()),
      p_raw,
      NULLIF(trim(COALESCE(p_original_transaction_id, '')), ''),
      NULLIF(trim(COALESCE(p_environment, '')), ''),
      v_end,
      p_app_account_token,
      'fulfilled',
      'semester_pass',
      now()
    );

    RETURN jsonb_build_object(
      'ok', true,
      'kind', 'semester_pass',
      'tier', v_tier,
      'period_end', v_end,
      'transaction_id', trim(p_transaction_id)
    );
  END IF;

  IF v_product.kind = 'subscription' THEN
    v_tier := v_product.tier;
    v_end := p_expires_at;

    INSERT INTO public.subscriptions (
      user_id, tier, status, stripe_subscription_id,
      current_period_end, cancel_at_period_end, source,
      appstore_original_transaction_id, updated_at
    )
    VALUES (
      p_uid, v_tier, 'active', NULL,
      v_end, false, 'app_store',
      NULLIF(trim(COALESCE(p_original_transaction_id, p_transaction_id)), ''),
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      tier = EXCLUDED.tier,
      status = EXCLUDED.status,
      stripe_subscription_id = NULL,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = false,
      source = 'app_store',
      appstore_original_transaction_id = COALESCE(
        EXCLUDED.appstore_original_transaction_id,
        public.subscriptions.appstore_original_transaction_id
      ),
      updated_at = now();

    IF v_end IS NOT NULL THEN
      PERFORM public.apply_subscription_period(p_uid, v_tier, v_end);
    END IF;

    INSERT INTO public.appstore_transactions (
      transaction_id, user_id, product_id, purchased_at, raw,
      original_transaction_id, environment, expires_at, app_account_token,
      status, kind, updated_at
    ) VALUES (
      trim(p_transaction_id),
      p_uid,
      trim(p_product_id),
      COALESCE(p_purchased_at, now()),
      p_raw,
      NULLIF(trim(COALESCE(p_original_transaction_id, '')), ''),
      NULLIF(trim(COALESCE(p_environment, '')), ''),
      v_end,
      p_app_account_token,
      'fulfilled',
      'subscription',
      now()
    );

    RETURN jsonb_build_object(
      'ok', true,
      'kind', 'subscription',
      'tier', v_tier,
      'period_end', v_end,
      'transaction_id', trim(p_transaction_id)
    );
  END IF;

  RAISE EXCEPTION 'unsupported product kind %', v_product.kind USING ERRCODE = 'P0001';
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.appstore_transactions
    WHERE transaction_id = trim(p_transaction_id);
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'transaction_id', v_existing.transaction_id,
        'kind', v_existing.kind,
        'status', v_existing.status
      );
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.appstore_fulfill_transaction(
  uuid, text, text, text, text, timestamptz, uuid, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.appstore_fulfill_transaction(
  uuid, text, text, text, text, timestamptz, uuid, timestamptz, jsonb
) TO service_role;

-- ---------------------------------------------------------------------------
-- Revoke / refund / expire
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.appstore_revoke_transaction(
  p_transaction_id text,
  p_reason text DEFAULT 'refund'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn public.appstore_transactions%ROWTYPE;
  v_claw_ref text;
  v_product public.appstore_products%ROWTYPE;
BEGIN
  IF p_transaction_id IS NULL OR length(trim(p_transaction_id)) = 0 THEN
    RAISE EXCEPTION 'missing transaction_id' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_txn
  FROM public.appstore_transactions
  WHERE transaction_id = trim(p_transaction_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_txn.status = 'revoked' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'transaction_id', v_txn.transaction_id,
      'status', 'revoked'
    );
  END IF;

  SELECT * INTO v_product
  FROM public.appstore_products
  WHERE product_id = v_txn.product_id;

  IF COALESCE(v_txn.kind, v_product.kind) = 'topup'
     AND v_product.credits_amount IS NOT NULL
     AND v_product.credits_amount > 0
  THEN
    v_claw_ref := 'appstore:clawback:' || trim(p_transaction_id);
    PERFORM public.credit_clawback_purchase(
      v_txn.user_id,
      v_product.credits_amount,
      v_claw_ref
    );
  END IF;

  IF COALESCE(v_txn.kind, v_product.kind) IN ('subscription', 'semester_pass') THEN
    UPDATE public.subscriptions
    SET
      status = 'canceled',
      cancel_at_period_end = false,
      updated_at = now()
    WHERE user_id = v_txn.user_id
      AND source = 'app_store'
      AND (
        appstore_original_transaction_id IS NULL
        OR appstore_original_transaction_id = COALESCE(
          v_txn.original_transaction_id,
          v_txn.transaction_id
        )
      );
  END IF;

  UPDATE public.appstore_transactions
  SET
    status = 'revoked',
    revoked_at = now(),
    updated_at = now(),
    raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object('revoke_reason', COALESCE(p_reason, 'refund'))
  WHERE transaction_id = v_txn.transaction_id;

  RETURN jsonb_build_object(
    'ok', true,
    'transaction_id', v_txn.transaction_id,
    'status', 'revoked',
    'kind', COALESCE(v_txn.kind, v_product.kind)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.appstore_revoke_transaction(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.appstore_revoke_transaction(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.appstore_expire_subscription(
  p_original_transaction_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
BEGIN
  IF p_original_transaction_id IS NULL OR length(trim(p_original_transaction_id)) = 0 THEN
    RAISE EXCEPTION 'missing original_transaction_id' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE appstore_original_transaction_id = trim(p_original_transaction_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  UPDATE public.subscriptions
  SET
    status = 'canceled',
    updated_at = now()
  WHERE user_id = v_sub.user_id;

  UPDATE public.appstore_transactions
  SET
    status = CASE WHEN status = 'revoked' THEN status ELSE 'expired' END,
    updated_at = now()
  WHERE original_transaction_id = trim(p_original_transaction_id)
    AND status = 'fulfilled';

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_sub.user_id,
    'status', 'canceled'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.appstore_expire_subscription(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.appstore_expire_subscription(text) TO service_role;

-- Resolve user for ASN v2 when appAccountToken missing (renewals)
CREATE OR REPLACE FUNCTION public.appstore_user_for_original_txn(p_original_transaction_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT user_id INTO v_uid
  FROM public.subscriptions
  WHERE appstore_original_transaction_id = trim(p_original_transaction_id)
  LIMIT 1;

  IF v_uid IS NOT NULL THEN
    RETURN v_uid;
  END IF;

  SELECT user_id INTO v_uid
  FROM public.appstore_transactions
  WHERE original_transaction_id = trim(p_original_transaction_id)
     OR transaction_id = trim(p_original_transaction_id)
  ORDER BY purchased_at DESC
  LIMIT 1;

  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.appstore_user_for_original_txn(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.appstore_user_for_original_txn(text) TO service_role;
