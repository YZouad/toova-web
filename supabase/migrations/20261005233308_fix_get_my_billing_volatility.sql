-- get_my_billing refreshes the credit wallet (INSERT/UPDATE). Marking it STABLE
-- made PostgREST run the RPC in a read-only transaction, so every call failed
-- with "cannot execute INSERT in a read-only transaction" (HTTP 405). The
-- client then fell back to the free plan and the 5-room cap, including for
-- admins and complimentary Pro grants.

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
