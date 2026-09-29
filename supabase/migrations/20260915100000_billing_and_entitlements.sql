-- Billing: plans, subscriptions, credit wallets, Stripe idempotency, entitlements RPCs.

-- ---------------------------------------------------------------------------
-- Plans & credit costs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.plans (
  tier text PRIMARY KEY,
  display_name text NOT NULL,
  max_rooms int,
  monthly_credits int NOT NULL DEFAULT 0,
  export_max_px int NOT NULL DEFAULT 1920,
  watermark boolean NOT NULL DEFAULT true,
  ar_export boolean NOT NULL DEFAULT false,
  share_ttl_days int,
  stripe_price_id_monthly text,
  stripe_price_id_yearly text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plans_max_rooms_positive_chk CHECK (max_rooms IS NULL OR max_rooms > 0),
  CONSTRAINT plans_monthly_credits_nonneg_chk CHECK (monthly_credits >= 0),
  CONSTRAINT plans_export_max_px_positive_chk CHECK (export_max_px > 0)
);

COMMENT ON COLUMN public.plans.max_rooms IS 'NULL = unlimited rooms.';
COMMENT ON COLUMN public.plans.share_ttl_days IS 'NULL = share links never expire.';

INSERT INTO public.plans (
  tier, display_name, max_rooms, monthly_credits, export_max_px, watermark, ar_export, share_ttl_days, sort_order
) VALUES
  ('free', 'Free', 5, 15, 1920, true, false, 14, 0),
  ('lite', 'Lite', 15, 60, 1920, false, false, 90, 1),
  ('pro', 'Pro', NULL, 250, 3840, false, true, NULL, 2)
ON CONFLICT (tier) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  max_rooms = EXCLUDED.max_rooms,
  monthly_credits = EXCLUDED.monthly_credits,
  export_max_px = EXCLUDED.export_max_px,
  watermark = EXCLUDED.watermark,
  ar_export = EXCLUDED.ar_export,
  share_ttl_days = EXCLUDED.share_ttl_days,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.credit_costs (
  operation text PRIMARY KEY,
  cost int NOT NULL,
  CONSTRAINT credit_costs_cost_positive_chk CHECK (cost > 0)
);

INSERT INTO public.credit_costs (operation, cost) VALUES ('trellis_generate', 5)
ON CONFLICT (operation) DO UPDATE SET cost = EXCLUDED.cost;

CREATE TABLE IF NOT EXISTS public.billing_products (
  sku text PRIMARY KEY,
  kind text NOT NULL,
  display_name text NOT NULL,
  credits_amount int,
  grant_tier text REFERENCES public.plans (tier),
  grant_months int,
  stripe_price_id text,
  published boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  CONSTRAINT billing_products_kind_chk CHECK (
    kind IN ('topup', 'semester_pass')
  )
);

INSERT INTO public.billing_products (sku, kind, display_name, credits_amount, sort_order) VALUES
  ('topup_50', 'topup', '50 credits', 50, 0),
  ('topup_150', 'topup', '150 credits', 150, 1),
  ('topup_400', 'topup', '400 credits', 400, 2),
  ('semester_pass', 'semester_pass', 'Semester Pass (5 months Pro)', NULL, 3)
ON CONFLICT (sku) DO NOTHING;

UPDATE public.billing_products
SET grant_tier = 'pro', grant_months = 5
WHERE sku = 'semester_pass';

-- ---------------------------------------------------------------------------
-- Customers, subscriptions, wallets, ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE,
  tier text NOT NULL REFERENCES public.plans (tier),
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL DEFAULT 'subscription',
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_source_chk CHECK (
    source IN ('subscription', 'semester_pass', 'admin')
  ),
  CONSTRAINT subscriptions_status_chk CHECK (
    status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete')
  )
);

CREATE TABLE IF NOT EXISTS public.credit_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  monthly_balance int NOT NULL DEFAULT 0,
  purchased_balance int NOT NULL DEFAULT 0,
  monthly_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_wallets_monthly_nonneg_chk CHECK (monthly_balance >= 0),
  CONSTRAINT credit_wallets_purchased_nonneg_chk CHECK (purchased_balance >= 0)
);

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  delta int NOT NULL,
  bucket text NOT NULL,
  reason text NOT NULL,
  ref text NOT NULL UNIQUE,
  operation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_ledger_bucket_chk CHECK (bucket IN ('monthly', 'purchased')),
  CONSTRAINT credit_ledger_reason_chk CHECK (
    reason IN ('grant', 'topup', 'generation', 'refund', 'admin', 'clawback')
  )
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
  ON public.credit_ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_read_all ON public.plans FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY credit_costs_read_all ON public.credit_costs FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY billing_products_read_published ON public.billing_products
  FOR SELECT TO authenticated, anon USING (published = true);

CREATE POLICY billing_customers_select_own ON public.billing_customers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY credit_wallets_select_own ON public.credit_wallets
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY credit_ledger_select_own ON public.credit_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- No client writes; service role bypasses RLS.

-- ---------------------------------------------------------------------------
-- Entitlements helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_effective_tier(p_uid uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text;
  v_sub public.subscriptions%ROWTYPE;
BEGIN
  IF p_uid IS NULL THEN
    RETURN 'free';
  END IF;

  IF public.is_admin(p_uid) THEN
    RETURN 'pro';
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = p_uid;
  IF NOT FOUND THEN
    RETURN 'free';
  END IF;

  IF v_sub.status NOT IN ('active', 'trialing') THEN
    RETURN 'free';
  END IF;

  IF v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end <= now() THEN
    RETURN 'free';
  END IF;

  RETURN v_sub.tier;
END;
$$;

REVOKE ALL ON FUNCTION public.get_effective_tier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_effective_tier(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_entitlements(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text;
  v_plan public.plans%ROWTYPE;
BEGIN
  v_tier := public.get_effective_tier(p_uid);
  SELECT * INTO v_plan FROM public.plans WHERE tier = v_tier;
  IF NOT FOUND THEN
    SELECT * INTO v_plan FROM public.plans WHERE tier = 'free';
  END IF;

  RETURN jsonb_build_object(
    'tier', v_tier,
    'display_name', v_plan.display_name,
    'max_rooms', v_plan.max_rooms,
    'unlimited_rooms', v_plan.max_rooms IS NULL,
    'monthly_credits', v_plan.monthly_credits,
    'export_max_px', v_plan.export_max_px,
    'watermark', v_plan.watermark,
    'ar_export', v_plan.ar_export,
    'share_ttl_days', v_plan.share_ttl_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_entitlements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_entitlements(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ensure_credit_wallet(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_monthly_credits_if_due(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.has_unlimited_rooms(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.get_entitlements(uid)->>'max_rooms') IS NULL;
$$;

REVOKE ALL ON FUNCTION public.has_unlimited_rooms(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_unlimited_rooms(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.max_rooms_for_user(p_uid uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.get_entitlements(p_uid)->>'max_rooms')::int;
$$;

REVOKE ALL ON FUNCTION public.max_rooms_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.max_rooms_for_user(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Credit wallet lifecycle
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_credit_wallet(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.plans%ROWTYPE;
  v_tier text;
BEGIN
  IF p_uid IS NULL THEN
    RETURN;
  END IF;

  v_tier := public.get_effective_tier(p_uid);
  SELECT * INTO v_plan FROM public.plans WHERE tier = v_tier;

  INSERT INTO public.credit_wallets (user_id, monthly_balance, purchased_balance, monthly_period_end)
  VALUES (
    p_uid,
    COALESCE(v_plan.monthly_credits, 0),
    0,
    date_trunc('month', now()) + interval '1 month'
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_credit_wallet(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_monthly_credits_if_due(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.credit_wallets%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_tier text;
BEGIN
  PERFORM public.ensure_credit_wallet(p_uid);
  SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_wallet.monthly_period_end IS NOT NULL AND v_wallet.monthly_period_end > now() THEN
    RETURN;
  END IF;

  v_tier := public.get_effective_tier(p_uid);
  SELECT * INTO v_plan FROM public.plans WHERE tier = v_tier;

  UPDATE public.credit_wallets
  SET
    monthly_balance = COALESCE(v_plan.monthly_credits, 0),
    monthly_period_end = date_trunc('month', now()) + interval '1 month',
    updated_at = now()
  WHERE user_id = p_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_monthly_credits_if_due(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_subscription_period(
  p_uid uuid,
  p_tier text,
  p_period_end timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.plans WHERE tier = p_tier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown plan tier %', p_tier USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.ensure_credit_wallet(p_uid);

  UPDATE public.credit_wallets
  SET
    monthly_balance = COALESCE(v_plan.monthly_credits, 0),
    monthly_period_end = COALESCE(p_period_end, date_trunc('month', now()) + interval '1 month'),
    updated_at = now()
  WHERE user_id = p_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subscription_period(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_period(uuid, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.credit_topup(
  p_uid uuid,
  p_credits int,
  p_ref text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_credits <= 0 THEN
    RAISE EXCEPTION 'topup credits must be positive' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.ensure_credit_wallet(p_uid);

  INSERT INTO public.credit_ledger (user_id, delta, bucket, reason, ref)
  VALUES (p_uid, p_credits, 'purchased', 'topup', p_ref);

  UPDATE public.credit_wallets
  SET purchased_balance = purchased_balance + p_credits, updated_at = now()
  WHERE user_id = p_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_topup(uuid, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_topup(uuid, int, text) TO service_role;

CREATE OR REPLACE FUNCTION public.spend_credits(
  p_uid uuid,
  p_op text,
  p_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost int;
  v_wallet public.credit_wallets%ROWTYPE;
  v_from_monthly int := 0;
  v_from_purchased int := 0;
BEGIN
  IF p_uid IS NULL OR p_op IS NULL OR p_ref IS NULL OR length(trim(p_ref)) = 0 THEN
    RAISE EXCEPTION 'invalid spend_credits arguments' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE ref IN (p_ref || ':monthly', p_ref || ':purchased')
  ) THEN
    SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_uid;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'monthly_balance', COALESCE(v_wallet.monthly_balance, 0),
      'purchased_balance', COALESCE(v_wallet.purchased_balance, 0)
    );
  END IF;

  SELECT cost INTO v_cost FROM public.credit_costs WHERE operation = p_op;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown credit operation %', p_op USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.refresh_monthly_credits_if_due(p_uid);
  SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet missing' USING ERRCODE = 'P0001';
  END IF;

  IF v_wallet.monthly_balance + v_wallet.purchased_balance < v_cost THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'cost', v_cost,
      'monthly_balance', v_wallet.monthly_balance,
      'purchased_balance', v_wallet.purchased_balance
    );
  END IF;

  v_from_monthly := LEAST(v_wallet.monthly_balance, v_cost);
  v_from_purchased := v_cost - v_from_monthly;

  UPDATE public.credit_wallets
  SET
    monthly_balance = monthly_balance - v_from_monthly,
    purchased_balance = purchased_balance - v_from_purchased,
    updated_at = now()
  WHERE user_id = p_uid;

  IF v_from_monthly > 0 THEN
    INSERT INTO public.credit_ledger (user_id, delta, bucket, reason, ref, operation)
    VALUES (p_uid, -v_from_monthly, 'monthly', 'generation', p_ref || ':monthly', p_op);
  END IF;

  IF v_from_purchased > 0 THEN
    INSERT INTO public.credit_ledger (user_id, delta, bucket, reason, ref, operation)
    VALUES (p_uid, -v_from_purchased, 'purchased', 'generation', p_ref || ':purchased', p_op);
  END IF;

  SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'cost', v_cost,
    'monthly_balance', v_wallet.monthly_balance,
    'purchased_balance', v_wallet.purchased_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.spend_credits(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_credits(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_credits(p_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.credit_ledger%ROWTYPE;
  v_refund_ref text;
BEGIN
  IF p_ref IS NULL OR length(trim(p_ref)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_ref');
  END IF;

  v_refund_ref := p_ref || ':refund';
  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE ref = v_refund_ref) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  FOR v_row IN
    SELECT * FROM public.credit_ledger
    WHERE ref IN (p_ref || ':monthly', p_ref || ':purchased')
      AND reason = 'generation'
  LOOP
    INSERT INTO public.credit_ledger (user_id, delta, bucket, reason, ref, operation)
    VALUES (
      v_row.user_id,
      -v_row.delta,
      v_row.bucket,
      'refund',
      v_refund_ref || ':' || v_row.bucket,
      v_row.operation
    );

    IF v_row.bucket = 'monthly' THEN
      UPDATE public.credit_wallets
      SET monthly_balance = monthly_balance + (-v_row.delta), updated_at = now()
      WHERE user_id = v_row.user_id;
    ELSE
      UPDATE public.credit_wallets
      SET purchased_balance = purchased_balance + (-v_row.delta), updated_at = now()
      WHERE user_id = v_row.user_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.refund_credits(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credits(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_billing()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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

-- Wallet on new profile
CREATE OR REPLACE FUNCTION public.profiles_init_credit_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_credit_wallet(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_init_credit_wallet ON public.profiles;
CREATE TRIGGER profiles_init_credit_wallet
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_init_credit_wallet();

-- Backfill wallets for existing profiles
INSERT INTO public.credit_wallets (user_id, monthly_balance, purchased_balance, monthly_period_end)
SELECT
  p.id,
  pl.monthly_credits,
  0,
  date_trunc('month', now()) + interval '1 month'
FROM public.profiles p
CROSS JOIN public.plans pl
WHERE pl.tier = 'free'
ON CONFLICT (user_id) DO NOTHING;
