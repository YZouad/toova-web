-- Dashboard double-fetch raced refresh_analytics_daily_rollups DELETE+INSERT
-- (unique_violation → PostgREST 409 "Failed to load analytics"). Serialize
-- refreshes and stop the payload SELECT from depending on `cur` having rows.

CREATE OR REPLACE FUNCTION public.refresh_analytics_daily_rollups(
  p_from date DEFAULT (CURRENT_DATE - 2),
  p_to date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int := 0;
BEGIN
  IF NOT (
    current_user IN ('postgres', 'supabase_admin')
    OR coalesce(auth.role(), '') = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.is_admin(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(87201401);

  DELETE FROM public.analytics_daily_rollups
  WHERE day BETWEEN p_from AND p_to;

  INSERT INTO public.analytics_daily_rollups (
    day, event_name, dimension_key, dimension_value,
    event_count, distinct_users, distinct_sessions, updated_at
  )
  SELECT
    e.occurred_at::date,
    e.name,
    dim.dimension_key,
    dim.dimension_value,
    count(*)::bigint,
    count(DISTINCT e.user_id)::bigint,
    count(DISTINCT e.session_id)::bigint,
    now()
  FROM public.analytics_events AS e
  CROSS JOIN LATERAL (
    VALUES
      ('all', 'all'),
      ('device', coalesce(e.device, 'unknown')),
      ('auth_method', coalesce(e.auth_method, 'unknown')),
      ('source', e.source),
      ('consent_scope', e.consent_scope)
  ) AS dim(dimension_key, dimension_value)
  WHERE e.occurred_at::date BETWEEN p_from AND p_to
  GROUP BY 1, 2, 3, 4
  ON CONFLICT (day, event_name, dimension_key, dimension_value) DO UPDATE SET
    event_count = EXCLUDED.event_count,
    distinct_users = EXCLUDED.distinct_users,
    distinct_sessions = EXCLUDED.distinct_sessions,
    updated_at = EXCLUDED.updated_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

DO $$
DECLARE
  src text;
BEGIN
  SELECT pg_get_functiondef('public.get_admin_analytics(timestamptz, timestamptz, jsonb)'::regprocedure)
    INTO src;
  IF src IS NULL THEN
    RAISE EXCEPTION 'get_admin_analytics is missing';
  END IF;
  src := replace(
    src,
    'PERFORM public.refresh_analytics_daily_rollups(v_from::date, v_to::date);',
    $p$BEGIN
  PERFORM public.refresh_analytics_daily_rollups(v_from::date, v_to::date);
EXCEPTION
  WHEN unique_violation OR deadlock_detected OR serialization_failure THEN
    NULL;
END;$p$
  );
  src := replace(src, ') INTO v_payload FROM cur LIMIT 1;', ') INTO v_payload;');
  EXECUTE src;
END $$;
