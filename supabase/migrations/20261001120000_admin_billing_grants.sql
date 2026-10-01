-- Admin complimentary plan grants + credit top-ups; admins skip Trellis credit spend.

-- ---------------------------------------------------------------------------
-- Admin: grant / revoke complimentary plan
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_grant_plan(
  p_user_id uuid,
  p_tier text,
  p_months int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_end timestamptz;
  v_existing public.subscriptions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = 'P0001';
  END IF;

  IF p_tier NOT IN ('lite', 'pro') THEN
    RAISE EXCEPTION 'tier must be lite or pro' USING ERRCODE = 'P0001';
  END IF;

  IF p_months IS NOT NULL AND p_months <= 0 THEN
    RAISE EXCEPTION 'months must be positive or null (permanent)' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing FROM public.subscriptions WHERE user_id = p_user_id;
  IF FOUND
     AND v_existing.source = 'subscription'
     AND v_existing.status IN ('active', 'trialing', 'past_due')
     AND v_existing.stripe_subscription_id IS NOT NULL
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'active_stripe_subscription',
      'message', 'User has an active Stripe subscription. Cancel or wait for it to end before granting a complimentary plan.'
    );
  END IF;

  IF p_months IS NULL THEN
    v_period_end := NULL;
  ELSE
    v_period_end := now() + make_interval(months => p_months);
  END IF;

  INSERT INTO public.subscriptions (
    user_id, tier, status, source, current_period_end, cancel_at_period_end,
    stripe_subscription_id, updated_at
  )
  VALUES (
    p_user_id, p_tier, 'active', 'admin', v_period_end, false,
    NULL, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier = EXCLUDED.tier,
    status = 'active',
    source = 'admin',
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = false,
    stripe_subscription_id = NULL,
    updated_at = now();

  PERFORM public.apply_subscription_period(p_user_id, p_tier, COALESCE(v_period_end, date_trunc('month', now()) + interval '1 month'));

  RETURN jsonb_build_object(
    'ok', true,
    'tier', p_tier,
    'source', 'admin',
    'current_period_end', v_period_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_plan(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_plan(uuid, text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_plan(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.subscriptions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing FROM public.subscriptions WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'revoked', false, 'message', 'No subscription row.');
  END IF;

  IF v_existing.source = 'subscription' AND v_existing.stripe_subscription_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'stripe_subscription',
      'message', 'Cannot revoke a Stripe-managed subscription from admin. Use the billing portal.'
    );
  END IF;

  UPDATE public.subscriptions
  SET
    status = 'canceled',
    cancel_at_period_end = false,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Drop monthly allowance back to free; keep purchased credits.
  PERFORM public.apply_subscription_period(
    p_user_id,
    'free',
    date_trunc('month', now()) + interval '1 month'
  );

  RETURN jsonb_build_object('ok', true, 'revoked', true, 'tier', 'free');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_plan(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin: grant purchased credits (never expire)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_grant_credits(
  p_user_id uuid,
  p_credits int,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
  v_wallet public.credit_wallets%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = 'P0001';
  END IF;

  IF p_credits IS NULL OR p_credits <= 0 OR p_credits > 100000 THEN
    RAISE EXCEPTION 'credits must be between 1 and 100000' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0001';
  END IF;

  v_ref := 'admin:grant:' || auth.uid()::text || ':' || p_user_id::text || ':' || replace(gen_random_uuid()::text, '-', '');

  PERFORM public.ensure_credit_wallet(p_user_id);

  INSERT INTO public.credit_ledger (user_id, delta, bucket, reason, ref, operation)
  VALUES (
    p_user_id,
    p_credits,
    'purchased',
    'admin',
    v_ref,
    COALESCE(NULLIF(trim(p_note), ''), 'admin_grant')
  );

  UPDATE public.credit_wallets
  SET purchased_balance = purchased_balance + p_credits, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING * INTO v_wallet;

  RETURN jsonb_build_object(
    'ok', true,
    'credits_granted', p_credits,
    'monthly_balance', v_wallet.monthly_balance,
    'purchased_balance', v_wallet.purchased_balance,
    'ref', v_ref
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_credits(uuid, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_credits(uuid, int, text) TO authenticated;

-- apply_subscription_period is currently service_role only; admin RPCs need it.
GRANT EXECUTE ON FUNCTION public.apply_subscription_period(uuid, text, timestamptz) TO authenticated;

-- Harden: only admins/service may call apply_subscription_period via a wrapper check.
-- Replace with admin-gated version for authenticated callers.
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
  v_caller uuid := auth.uid();
BEGIN
  -- service_role has no auth.uid(); allow. Authenticated must be admin.
  IF v_caller IS NOT NULL AND NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE tier = p_tier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown plan tier %' , p_tier USING ERRCODE = 'P0001';
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

-- ---------------------------------------------------------------------------
-- Admins: unlimited Trellis generations (skip debit)
-- ---------------------------------------------------------------------------

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

  -- Platform admins generate without debiting the wallet.
  IF public.is_admin(p_uid) THEN
    PERFORM public.ensure_credit_wallet(p_uid);
    SELECT * INTO v_wallet FROM public.credit_wallets WHERE user_id = p_uid;
    INSERT INTO public.credit_ledger (user_id, delta, bucket, reason, ref, operation)
    VALUES (p_uid, 0, 'monthly', 'admin', p_ref || ':admin_skip', p_op);
    RETURN jsonb_build_object(
      'ok', true,
      'admin_unlimited', true,
      'cost', 0,
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

-- ---------------------------------------------------------------------------
-- Enrich admin user overview with billing snapshot
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
