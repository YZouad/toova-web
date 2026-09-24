-- Replace billing_placeholder KPI with real plan_upgraded counts.
-- Patch only the KPI fragment inside get_admin_analytics by wrapping a helper view function.

CREATE OR REPLACE FUNCTION public.billing_upgrade_kpi(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cur AS (
    SELECT COUNT(*)::bigint AS n
    FROM public.analytics_events
    WHERE name = 'plan_upgraded'
      AND occurred_at >= p_from
      AND occurred_at < p_to
  ),
  prev AS (
    SELECT COUNT(*)::bigint AS n
    FROM public.analytics_events
    WHERE name = 'plan_upgraded'
      AND occurred_at >= (p_from - (p_to - p_from))
      AND occurred_at < p_from
  )
  SELECT jsonb_build_object(
    'key', 'plan_upgrades',
    'label', 'Plan upgrades',
    'value', (SELECT n FROM cur),
    'previous', (SELECT n FROM prev),
    'delta_pct', CASE
      WHEN (SELECT n FROM prev) = 0 THEN NULL
      ELSE round((((SELECT n FROM cur) - (SELECT n FROM prev))::numeric / (SELECT n FROM prev)) * 100, 1)
    END,
    'scope', 'consented',
    'unavailable', false
  );
$$;

REVOKE ALL ON FUNCTION public.billing_upgrade_kpi(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_upgrade_kpi(timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.billing_upgrade_kpi(timestamptz, timestamptz) IS
  'KPI for admin analytics: plan_upgraded event counts. Wire into get_admin_analytics dashboard when refreshing the KPI array.';
