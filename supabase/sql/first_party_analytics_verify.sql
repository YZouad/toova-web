-- Verification queries for first-party analytics (run as postgres / SQL editor).

SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('analytics_events', 'analytics_daily_rollups');

SELECT
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'ingest_analytics_events',
    'get_admin_analytics',
    'get_admin_analytics_events',
    'get_admin_user_analytics',
    'analytics_count_series'
  );

SELECT count(*) AS backfill_rows
FROM public.analytics_events
WHERE source = 'relational_backfill';

SELECT count(*) AS rollup_rows FROM public.analytics_daily_rollups;

EXPLAIN (FORMAT TEXT)
SELECT count(*)
FROM public.analytics_events
WHERE occurred_at >= now() - interval '30 days'
  AND name = 'page_view';
