-- Lazy monthly free-plan credit grant + analytics billing KPI.

CREATE OR REPLACE FUNCTION public.ensure_period_credits(p_uid uuid DEFAULT auth.uid())
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ent jsonb;
  plan_code text;
  grant_amt int;
  period_key text;
  available int;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS DISTINCT FROM p_uid AND auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  ent := public.get_entitlements(p_uid);
  plan_code := COALESCE(ent->>'plan_code', 'free');

  SELECT monthly_credit_grant INTO grant_amt
  FROM public.billing_plans
  WHERE code = plan_code;
  grant_amt := COALESCE(grant_amt, 0);

  -- Paid plans are granted on invoice.paid. Free (and any plan without a sub cycle) gets a calendar-month grant.
  IF plan_code = 'free' AND grant_amt > 0 THEN
    period_key := 'free-month:' || p_uid::text || ':' || to_char(now() AT TIME ZONE 'utc', 'YYYY-MM');
    PERFORM public.grant_credits(
      p_uid,
      grant_amt,
      period_key,
      (date_trunc('month', now() AT TIME ZONE 'utc') + interval '1 month') AT TIME ZONE 'utc',
      'free_monthly_grant',
      period_key
    );
  END IF;

  available := public.credit_available_balance(p_uid);
  RETURN available;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_period_credits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_period_credits(uuid) TO authenticated;

-- Allow service role sweeper (PostgREST service_role)
GRANT EXECUTE ON FUNCTION public.release_stale_credit_holds(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, int, text, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_entitlements(uuid) TO service_role;
