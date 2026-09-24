-- Billing foundation: plans, prices, entitlements, ledger, webhook inbox,
-- entitlement resolver, room-cap rewrite, credit hold/settle, share expiry clamp.
-- Terms version bump for refund/cancellation sections.

-- ---------------------------------------------------------------------------
-- 0. Legal terms version (refund / cancellation / paid plans)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_terms_version()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT '2026-09-23'::text $$;

-- ---------------------------------------------------------------------------
-- 1. Catalog tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_plans (
  code text PRIMARY KEY,
  display_name text NOT NULL,
  tier_rank int NOT NULL,
  monthly_credit_grant int NOT NULL DEFAULT 0 CHECK (monthly_credit_grant >= 0),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code text REFERENCES public.billing_plans (code),
  provider text NOT NULL DEFAULT 'stripe',
  provider_price_id text NOT NULL,
  interval text NOT NULL CHECK (interval IN ('month', 'year', 'one_time')),
  audience text NOT NULL DEFAULT 'public' CHECK (audience IN ('public', 'student')),
  amount_cents int NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  credit_grant int CHECK (credit_grant IS NULL OR credit_grant >= 0),
  is_purchasable boolean NOT NULL DEFAULT false,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_prices_provider_price_unique UNIQUE (provider, provider_price_id),
  CONSTRAINT billing_prices_plan_or_pack CHECK (
    (interval IN ('month', 'year') AND plan_code IS NOT NULL)
    OR (interval = 'one_time' AND credit_grant IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS billing_prices_plan_code_idx
  ON public.billing_prices (plan_code)
  WHERE retired_at IS NULL;

CREATE TABLE IF NOT EXISTS public.plan_entitlements (
  plan_code text NOT NULL REFERENCES public.billing_plans (code) ON DELETE CASCADE,
  feature_key text NOT NULL,
  limit_value int,
  flag_value boolean,
  PRIMARY KEY (plan_code, feature_key)
  -- limit_value NULL = unlimited for numeric features; flag_value used for booleans.
);

CREATE TABLE IF NOT EXISTS public.billing_customers (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe',
  provider_customer_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider),
  CONSTRAINT billing_customers_provider_customer_unique UNIQUE (provider, provider_customer_id)
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe',
  provider_subscription_id text NOT NULL,
  plan_code text NOT NULL REFERENCES public.billing_plans (code),
  status text NOT NULL,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  trial_end timestamptz,
  student_verification text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_provider_sub_unique UNIQUE (provider, provider_subscription_id)
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_active_user_idx
  ON public.subscriptions (user_id)
  WHERE status IN ('active', 'trialing', 'past_due');

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  delta int NOT NULL,
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  expires_at timestamptz,
  source_ref text,
  status text NOT NULL DEFAULT 'settled'
    CHECK (status IN ('held', 'settled', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_ledger_user_idempotency_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT credit_ledger_held_negative CHECK (
    status <> 'held' OR delta < 0
  )
);

CREATE INDEX IF NOT EXISTS credit_ledger_user_status_idx
  ON public.credit_ledger (user_id, status);
CREATE INDEX IF NOT EXISTS credit_ledger_held_created_idx
  ON public.credit_ledger (created_at)
  WHERE status = 'held';

CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'stripe',
  provider_event_id text NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text,
  attempts int NOT NULL DEFAULT 0,
  CONSTRAINT billing_events_provider_event_unique UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS billing_events_unprocessed_idx
  ON public.billing_events (received_at)
  WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.entitlement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  limit_value int,
  flag_value boolean,
  expires_at timestamptz,
  note text,
  granted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
);

CREATE INDEX IF NOT EXISTS entitlement_overrides_user_idx
  ON public.entitlement_overrides (user_id);

CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  meter_key text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS usage_events_user_meter_idx
  ON public.usage_events (user_id, meter_key, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Public catalog readable by authenticated (pricing page)
DROP POLICY IF EXISTS billing_plans_select ON public.billing_plans;
CREATE POLICY billing_plans_select ON public.billing_plans
  FOR SELECT TO authenticated, anon
  USING (retired_at IS NULL);

DROP POLICY IF EXISTS billing_prices_select ON public.billing_prices;
CREATE POLICY billing_prices_select ON public.billing_prices
  FOR SELECT TO authenticated, anon
  USING (retired_at IS NULL AND is_purchasable = true);

DROP POLICY IF EXISTS plan_entitlements_select ON public.plan_entitlements;
CREATE POLICY plan_entitlements_select ON public.plan_entitlements
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS subscriptions_owner_select ON public.subscriptions;
CREATE POLICY subscriptions_owner_select ON public.subscriptions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS credit_ledger_owner_select ON public.credit_ledger;
CREATE POLICY credit_ledger_owner_select ON public.credit_ledger
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS entitlement_overrides_owner_select ON public.entitlement_overrides;
CREATE POLICY entitlement_overrides_owner_select ON public.entitlement_overrides
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Deny-all client access (service role only) — same pattern as user_integrations
DROP POLICY IF EXISTS billing_customers_no_client ON public.billing_customers;
CREATE POLICY billing_customers_no_client ON public.billing_customers
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS billing_events_no_client ON public.billing_events;
CREATE POLICY billing_events_no_client ON public.billing_events
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS usage_events_no_client ON public.usage_events;
CREATE POLICY usage_events_no_client ON public.usage_events
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

REVOKE ALL ON public.billing_customers FROM anon, authenticated;
REVOKE ALL ON public.billing_events FROM anon, authenticated;
REVOKE ALL ON public.usage_events FROM anon, authenticated;

GRANT SELECT ON public.billing_plans TO anon, authenticated;
GRANT SELECT ON public.billing_prices TO anon, authenticated;
GRANT SELECT ON public.plan_entitlements TO anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT SELECT ON public.entitlement_overrides TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Seed plans + entitlements + placeholder prices
-- ---------------------------------------------------------------------------
INSERT INTO public.billing_plans (code, display_name, tier_rank, monthly_credit_grant)
VALUES
  ('free', 'Free', 0, 3),
  ('lite_v1', 'Lite', 1, 30),
  ('studio_v1', 'Studio', 2, 150)
ON CONFLICT (code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    tier_rank = EXCLUDED.tier_rank,
    monthly_credit_grant = EXCLUDED.monthly_credit_grant;

-- Entitlement ladder (NULL limit_value = unlimited for int features)
INSERT INTO public.plan_entitlements (plan_code, feature_key, limit_value, flag_value) VALUES
  ('free', 'max_rooms', 5, NULL),
  ('free', 'monthly_credits', 3, NULL),
  ('free', 'export_max_px', 1280, NULL),
  ('free', 'export_watermark', NULL, true),
  ('free', 'ar_usdz_export', NULL, false),
  ('free', 'share_link_max_days', 7, NULL),

  ('lite_v1', 'max_rooms', 15, NULL),
  ('lite_v1', 'monthly_credits', 30, NULL),
  ('lite_v1', 'export_max_px', 2560, NULL),
  ('lite_v1', 'export_watermark', NULL, false),
  ('lite_v1', 'ar_usdz_export', NULL, false),
  ('lite_v1', 'share_link_max_days', 90, NULL),

  ('studio_v1', 'max_rooms', NULL, NULL),
  ('studio_v1', 'monthly_credits', 150, NULL),
  ('studio_v1', 'export_max_px', NULL, NULL),
  ('studio_v1', 'export_watermark', NULL, false),
  ('studio_v1', 'ar_usdz_export', NULL, true),
  ('studio_v1', 'share_link_max_days', NULL, NULL)
ON CONFLICT (plan_code, feature_key) DO UPDATE
SET limit_value = EXCLUDED.limit_value,
    flag_value = EXCLUDED.flag_value;

-- Placeholder Stripe price IDs (is_purchasable=false until ops fills real IDs + amounts)
INSERT INTO public.billing_prices (
  plan_code, provider, provider_price_id, interval, audience, amount_cents, currency, is_purchasable
) VALUES
  ('lite_v1', 'stripe', 'price_pending_lite_month_public', 'month', 'public', 0, 'usd', false),
  ('lite_v1', 'stripe', 'price_pending_lite_year_public', 'year', 'public', 0, 'usd', false),
  ('lite_v1', 'stripe', 'price_pending_lite_month_student', 'month', 'student', 0, 'usd', false),
  ('lite_v1', 'stripe', 'price_pending_lite_year_student', 'year', 'student', 0, 'usd', false),
  ('studio_v1', 'stripe', 'price_pending_studio_month_public', 'month', 'public', 0, 'usd', false),
  ('studio_v1', 'stripe', 'price_pending_studio_year_public', 'year', 'public', 0, 'usd', false),
  ('studio_v1', 'stripe', 'price_pending_studio_month_student', 'month', 'student', 0, 'usd', false),
  ('studio_v1', 'stripe', 'price_pending_studio_year_student', 'year', 'student', 0, 'usd', false)
ON CONFLICT (provider, provider_price_id) DO NOTHING;

INSERT INTO public.billing_prices (
  plan_code, provider, provider_price_id, interval, audience, amount_cents, currency, credit_grant, is_purchasable
) VALUES
  (NULL, 'stripe', 'price_pending_credits_50', 'one_time', 'public', 0, 'usd', 50, false),
  (NULL, 'stripe', 'price_pending_credits_200', 'one_time', 'public', 0, 'usd', 200, false)
ON CONFLICT (provider, provider_price_id) DO NOTHING;

-- Admins inherit unlimited rooms via overrides (replaces is_admin shortcut)
INSERT INTO public.entitlement_overrides (user_id, feature_key, limit_value, note)
SELECT a.user_id, 'max_rooms', NULL, 'admin seed'
FROM public.admins AS a
WHERE NOT EXISTS (
  SELECT 1 FROM public.entitlement_overrides AS o
  WHERE o.user_id = a.user_id AND o.feature_key = 'max_rooms' AND o.note = 'admin seed'
);

-- ---------------------------------------------------------------------------
-- 4. Credit balance helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_settled_balance(p_uid uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(delta), 0)::int
  FROM public.credit_ledger
  WHERE user_id = p_uid
    AND status = 'settled'
    AND (expires_at IS NULL OR expires_at > now());
$$;

CREATE OR REPLACE FUNCTION public.credit_held_amount(p_uid uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(ABS(delta)), 0)::int
  FROM public.credit_ledger
  WHERE user_id = p_uid
    AND status = 'held';
$$;

CREATE OR REPLACE FUNCTION public.credit_available_balance(p_uid uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.credit_settled_balance(p_uid) - public.credit_held_amount(p_uid);
$$;

REVOKE ALL ON FUNCTION public.credit_settled_balance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.credit_held_amount(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.credit_available_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.credit_available_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_settled_balance(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. get_entitlements resolver
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_entitlements(p_uid uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text := 'free';
  v_status text := 'none';
  v_period_end timestamptz := NULL;
  v_tier_rank int := 0;
  v_features jsonb := '{}'::jsonb;
  r record;
  o record;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Self or admin only
  IF auth.uid() IS DISTINCT FROM p_uid AND NOT public.is_admin(auth.uid()) THEN
    -- Service role has auth.uid() null; allow when called from service role
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT s.plan_code, s.status, s.current_period_end, p.tier_rank
  INTO v_plan, v_status, v_period_end, v_tier_rank
  FROM public.subscriptions AS s
  JOIN public.billing_plans AS p ON p.code = s.plan_code
  WHERE s.user_id = p_uid
    AND s.status IN ('active', 'trialing', 'past_due')
  ORDER BY
    CASE s.status WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 ELSE 2 END,
    p.tier_rank DESC,
    s.updated_at DESC
  LIMIT 1;

  IF v_plan IS NULL THEN
    v_plan := 'free';
    v_status := 'none';
    v_period_end := NULL;
    SELECT tier_rank INTO v_tier_rank FROM public.billing_plans WHERE code = 'free';
  END IF;

  FOR r IN
    SELECT feature_key, limit_value, flag_value
    FROM public.plan_entitlements
    WHERE plan_code = v_plan
  LOOP
    IF r.flag_value IS NOT NULL THEN
      v_features := v_features || jsonb_build_object(r.feature_key, r.flag_value);
    ELSE
      v_features := v_features || jsonb_build_object(r.feature_key, to_jsonb(r.limit_value));
    END IF;
  END LOOP;

  -- Overrides win (including NULL limit = unlimited)
  FOR o IN
    SELECT feature_key, limit_value, flag_value
    FROM public.entitlement_overrides
    WHERE user_id = p_uid
      AND (expires_at IS NULL OR expires_at > now())
  LOOP
    IF o.flag_value IS NOT NULL THEN
      v_features := v_features || jsonb_build_object(o.feature_key, o.flag_value);
    ELSE
      v_features := v_features || jsonb_build_object(o.feature_key, to_jsonb(o.limit_value));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'user_id', p_uid,
    'plan_code', v_plan,
    'tier_rank', COALESCE(v_tier_rank, 0),
    'status', v_status,
    'current_period_end', v_period_end,
    'credits_available', public.credit_available_balance(p_uid),
    'credits_settled', public.credit_settled_balance(p_uid),
    'features', v_features
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_entitlements(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_entitlements(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_entitlements(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_entitlements(uuid) IS
  'Resolved entitlements: overrides > active subscription plan > free. Includes live credit balances.';

-- Own entitlements convenience (auth.uid default)
CREATE OR REPLACE FUNCTION public.get_own_entitlements()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_entitlements(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_own_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_entitlements() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Room cap via entitlements (replaces hardcoded 5 + is_admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_unlimited_rooms(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.get_entitlements(uid)->'features'->'max_rooms') IS NULL
    OR (public.get_entitlements(uid)->'features'->>'max_rooms') IS NULL;
$$;

COMMENT ON FUNCTION public.has_unlimited_rooms(uuid) IS
  'True when max_rooms entitlement is unlimited (NULL). Admins get this via entitlement_overrides.';

CREATE OR REPLACE FUNCTION public.rooms_max_for_user(uid uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  v := public.get_entitlements(uid)->'features'->'max_rooms';
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
    RETURN NULL; -- unlimited
  END IF;
  RETURN (v #>> '{}')::int;
END;
$$;

CREATE OR REPLACE FUNCTION public.rooms_enforce_room_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  room_count int;
  max_rooms int;
BEGIN
  max_rooms := public.rooms_max_for_user(NEW.user_id);
  IF max_rooms IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int INTO room_count
  FROM public.rooms
  WHERE user_id = NEW.user_id;

  IF room_count >= max_rooms THEN
    RAISE EXCEPTION 'room limit reached (% rooms)', max_rooms
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.copy_room_as_fork(
  p_source_id uuid,
  p_uid uuid,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  room_row public.rooms%ROWTYPE;
  new_id uuid;
  room_count int;
  copy_name text;
  max_rooms int;
BEGIN
  SELECT * INTO room_row FROM public.rooms WHERE id = p_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found'
      USING ERRCODE = 'P0001';
  END IF;

  max_rooms := public.rooms_max_for_user(p_uid);
  SELECT COUNT(*)::int INTO room_count FROM public.rooms WHERE user_id = p_uid;
  IF max_rooms IS NOT NULL AND room_count >= max_rooms THEN
    RAISE EXCEPTION 'room limit reached (% rooms)', max_rooms
      USING ERRCODE = 'P0001';
  END IF;

  copy_name := COALESCE(NULLIF(trim(p_name), ''), room_row.name || ' (copy)');

  PERFORM set_config('app.toova_bypass_room_guards', '1', true);

  INSERT INTO public.rooms (
    user_id, name, environment, room_geometry, forked_from, visibility, fork_count
  )
  VALUES (
    p_uid,
    copy_name,
    room_row.environment,
    room_row.room_geometry,
    room_row.id,
    'private',
    0
  )
  RETURNING id INTO new_id;

  INSERT INTO public.room_items (
    room_id, kind, label,
    pos_x, pos_y, pos_z, rotation_y,
    size_w, size_h, size_d,
    bed_leg_height, natural_w, natural_h, natural_d,
    sort_order, model_url,
    bedding_enabled, blanket_color, blanket_texture_path,
    bedding_config,
    emitter, curated_product_id,
    instance_key, hanging_config
  )
  SELECT
    new_id, kind, label,
    pos_x, pos_y, pos_z, rotation_y,
    size_w, size_h, size_d,
    bed_leg_height, natural_w, natural_h, natural_d,
    sort_order, model_url,
    bedding_enabled, blanket_color, blanket_texture_path,
    bedding_config,
    emitter, curated_product_id,
    instance_key, hanging_config
  FROM public.room_items
  WHERE room_id = room_row.id
  ORDER BY sort_order;

  UPDATE public.rooms
  SET fork_count = fork_count + 1
  WHERE id = room_row.id;

  RETURN new_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Credit hold / settle / release
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hold_credits(
  p_amount int,
  p_idempotency_key text,
  p_ref text DEFAULT NULL,
  p_uid uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing uuid;
  hold_id uuid;
  available int;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS DISTINCT FROM p_uid AND auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid credit amount' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO existing
  FROM public.credit_ledger
  WHERE user_id = p_uid AND idempotency_key = p_idempotency_key;

  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  available := public.credit_available_balance(p_uid);
  IF available < p_amount THEN
    RAISE EXCEPTION 'insufficient credits (have %, need %)', available, p_amount
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.credit_ledger (
    user_id, delta, reason, idempotency_key, source_ref, status
  )
  VALUES (
    p_uid, -p_amount, 'hold', p_idempotency_key, p_ref, 'held'
  )
  RETURNING id INTO hold_id;

  RETURN hold_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_credits(p_hold_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.credit_ledger%ROWTYPE;
BEGIN
  SELECT * INTO row FROM public.credit_ledger WHERE id = p_hold_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hold not found' USING ERRCODE = 'P0001';
  END IF;
  IF auth.uid() IS DISTINCT FROM row.user_id AND auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF row.status = 'settled' THEN
    RETURN;
  END IF;
  IF row.status <> 'held' THEN
    RAISE EXCEPTION 'hold is not active' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.credit_ledger
  SET status = 'settled', reason = 'spend'
  WHERE id = p_hold_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_credits(p_hold_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.credit_ledger%ROWTYPE;
BEGIN
  SELECT * INTO row FROM public.credit_ledger WHERE id = p_hold_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hold not found' USING ERRCODE = 'P0001';
  END IF;
  IF auth.uid() IS DISTINCT FROM row.user_id AND auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF row.status = 'released' THEN
    RETURN;
  END IF;
  IF row.status <> 'held' THEN
    RAISE EXCEPTION 'hold is not active' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.credit_ledger
  SET status = 'released', reason = 'release'
  WHERE id = p_hold_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stale_credit_holds(p_older_than interval DEFAULT interval '30 minutes')
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.credit_ledger
  SET status = 'released', reason = 'stale_hold_release'
  WHERE status = 'held'
    AND created_at < now() - p_older_than;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_credits(
  p_uid uuid,
  p_amount int,
  p_idempotency_key text,
  p_expires_at timestamptz DEFAULT NULL,
  p_reason text DEFAULT 'grant',
  p_source_ref text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing uuid;
  new_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid credit amount' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO existing
  FROM public.credit_ledger
  WHERE user_id = p_uid AND idempotency_key = p_idempotency_key;
  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  INSERT INTO public.credit_ledger (
    user_id, delta, reason, idempotency_key, expires_at, source_ref, status
  )
  VALUES (
    p_uid, p_amount, p_reason, p_idempotency_key, p_expires_at, p_source_ref, 'settled'
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hold_credits(int, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settle_credits(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_credits(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_stale_credit_holds(interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_credits(uuid, int, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hold_credits(int, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_credits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_credits(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Share link expiry clamp (BEFORE INSERT/UPDATE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.room_shares_clamp_expires()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_days int;
  owner_id uuid;
  ent jsonb;
BEGIN
  SELECT user_id INTO owner_id FROM public.rooms WHERE id = NEW.room_id;
  IF owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  ent := public.get_entitlements(owner_id)->'features'->'share_link_max_days';
  IF ent IS NULL OR jsonb_typeof(ent) = 'null' THEN
    -- unlimited: leave expires_at as provided (NULL = never)
    RETURN NEW;
  END IF;

  max_days := (ent #>> '{}')::int;
  IF NEW.expires_at IS NULL OR NEW.expires_at > now() + make_interval(days => max_days) THEN
    NEW.expires_at := now() + make_interval(days => max_days);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS room_shares_clamp_expires ON public.room_shares;
CREATE TRIGGER room_shares_clamp_expires
  BEFORE INSERT OR UPDATE OF expires_at ON public.room_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.room_shares_clamp_expires();

REVOKE ALL ON FUNCTION public.room_shares_clamp_expires() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Record usage (service / authenticated own)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_usage_event(
  p_meter_key text,
  p_quantity numeric DEFAULT 1,
  p_ref text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_uid uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS DISTINCT FROM p_uid AND auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.usage_events (user_id, meter_key, quantity, ref, metadata)
  VALUES (p_uid, p_meter_key, COALESCE(p_quantity, 1), p_ref, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_usage_event(text, numeric, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_usage_event(text, numeric, text, jsonb, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Admin: resolve plan from entitlements in user overview
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_user_overview(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
  v_analytics jsonb;
  v_ent jsonb;
  v_plan text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_analytics := public.get_admin_user_analytics(p_user_id, now() - interval '90 days', now());
  v_ent := public.get_entitlements(p_user_id);
  v_plan := COALESCE(v_ent->>'plan_code', 'free');

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
      'plan', v_plan,
      'entitlements', v_ent
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

-- ---------------------------------------------------------------------------
-- 11. Admin billing helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_grant_entitlement_override(
  p_user_id uuid,
  p_feature_key text,
  p_limit_value int DEFAULT NULL,
  p_flag_value boolean DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.entitlement_overrides (
    user_id, feature_key, limit_value, flag_value, expires_at, note, granted_by
  )
  VALUES (
    p_user_id, p_feature_key, p_limit_value, p_flag_value, p_expires_at, p_note, auth.uid()
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_grant_credits(
  p_user_id uuid,
  p_amount int,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN public.grant_credits(
    p_user_id,
    p_amount,
    'admin:' || auth.uid()::text || ':' || gen_random_uuid()::text,
    NULL,
    'admin_grant',
    p_note
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_billing(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'entitlements', public.get_entitlements(p_user_id),
    'subscriptions', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.updated_at DESC)
      FROM public.subscriptions AS s
      WHERE s.user_id = p_user_id
    ), '[]'::jsonb),
    'ledger', COALESCE((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC)
      FROM (
        SELECT * FROM public.credit_ledger WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 100
      ) AS l
    ), '[]'::jsonb),
    'overrides', COALESCE((
      SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC)
      FROM public.entitlement_overrides AS o
      WHERE o.user_id = p_user_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_entitlement_override(uuid, text, int, boolean, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_grant_credits(uuid, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_user_billing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_entitlement_override(uuid, text, int, boolean, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_credits(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_billing(uuid) TO authenticated;

COMMENT ON TABLE public.billing_plans IS 'Immutable plan entitlement bundles. Reprice by adding a new code (e.g. studio_v2).';
COMMENT ON TABLE public.billing_prices IS 'Stripe (or other) prices keyed to plans or one-time credit packs.';
COMMENT ON TABLE public.credit_ledger IS 'Append-only credit ledger. Balance = settled - held. Never mutate deltas.';
COMMENT ON TABLE public.billing_events IS 'Webhook inbox. Insert-then-process with unique provider_event_id.';
