-- First-party analytics: consented event store, relational backfill, rollups, admin RPCs.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id text,
  anonymous_id text,
  room_id uuid,
  job_id uuid,
  product_id text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  route text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device text,
  auth_method text,
  source text NOT NULL DEFAULT 'client'
    CHECK (source IN ('client', 'relational_backfill')),
  consent_scope text NOT NULL DEFAULT 'consented'
    CHECK (consent_scope IN ('consented', 'operational_backfill')),
  CONSTRAINT analytics_events_name_chk CHECK (
    name = ANY (ARRAY[
      'account_signed_up',
      'account_logged_in',
      'room_created',
      'design_item_added',
      'model_generation_started',
      'model_generation_succeeded',
      'model_generation_failed',
      'checklist_item_added',
      'product_affiliate_clicked',
      'room_shared',
      'room_liked',
      'catalog_searched',
      'plan_upgraded',
      'plan_cancelled',
      'limit_reached',
      'page_view',
      'session_started'
    ]::text[])
  ),
  CONSTRAINT analytics_events_session_len_chk
    CHECK (session_id IS NULL OR char_length(session_id) BETWEEN 8 AND 80),
  CONSTRAINT analytics_events_anon_len_chk
    CHECK (anonymous_id IS NULL OR char_length(anonymous_id) BETWEEN 8 AND 80)
);

CREATE INDEX IF NOT EXISTS analytics_events_user_occurred_idx
  ON public.analytics_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_occurred_idx
  ON public.analytics_events (name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_occurred_idx
  ON public.analytics_events (session_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_occurred_idx
  ON public.analytics_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_received_idx
  ON public.analytics_events (received_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_device_occurred_idx
  ON public.analytics_events (device, occurred_at DESC)
  WHERE device IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_events_consented_occurred_idx
  ON public.analytics_events (occurred_at DESC)
  WHERE consent_scope = 'consented';

CREATE TABLE IF NOT EXISTS public.analytics_daily_rollups (
  day date NOT NULL,
  event_name text NOT NULL,
  dimension_key text NOT NULL DEFAULT 'all',
  dimension_value text NOT NULL DEFAULT 'all',
  event_count bigint NOT NULL DEFAULT 0,
  distinct_users bigint NOT NULL DEFAULT 0,
  distinct_sessions bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, event_name, dimension_key, dimension_value)
);

CREATE INDEX IF NOT EXISTS analytics_daily_rollups_event_day_idx
  ON public.analytics_daily_rollups (event_name, day DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_daily_rollups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_events_no_client ON public.analytics_events;
CREATE POLICY analytics_events_no_client ON public.analytics_events
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS analytics_daily_rollups_no_client ON public.analytics_daily_rollups;
CREATE POLICY analytics_daily_rollups_no_client ON public.analytics_daily_rollups
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.analytics_events FROM PUBLIC;
REVOKE ALL ON TABLE public.analytics_events FROM anon;
REVOKE ALL ON TABLE public.analytics_events FROM authenticated;
REVOKE ALL ON TABLE public.analytics_daily_rollups FROM PUBLIC;
REVOKE ALL ON TABLE public.analytics_daily_rollups FROM anon;
REVOKE ALL ON TABLE public.analytics_daily_rollups FROM authenticated;

CREATE OR REPLACE FUNCTION public.analytics_stable_uuid(p_seed text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT md5(p_seed)::uuid;
$$;

CREATE OR REPLACE FUNCTION public.analytics_delta_pct(p_curr numeric, p_prev numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_prev IS NULL OR p_prev = 0 THEN NULL
    ELSE round(((p_curr - p_prev) / p_prev) * 1000) / 10
  END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_sanitize_properties(p_props jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_val jsonb;
  v_out jsonb := '{}'::jsonb;
  v_allowed text[] := ARRAY[
    'method', 'converted_from_guest', 'room_id', 'template_id', 'is_guest',
    'kind', 'source', 'curated_product_id', 'job_id', 'source_type',
    'duration_ms', 'failure_reason', 'product_id', 'category', 'is_curated',
    'retailer', 'is_price_approximate', 'role', 'query', 'results_count',
    'context', 'from_plan', 'to_plan', 'reason', 'limit_type',
    'page_path', 'page_title', 'page_referrer', 'page_location'
  ];
  v_count int := 0;
BEGIN
  IF p_props IS NULL OR jsonb_typeof(p_props) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_props)
  LOOP
    EXIT WHEN v_count >= 25;
    IF NOT (v_key = ANY (v_allowed)) THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(v_val) = 'string' THEN
      v_out := v_out || jsonb_build_object(v_key, left(v_val #>> '{}', 100));
      v_count := v_count + 1;
    ELSIF jsonb_typeof(v_val) IN ('number', 'boolean') THEN
      v_out := v_out || jsonb_build_object(v_key, v_val);
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_analytics_events(p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_accepted int := 0;
  v_duplicate int := 0;
  v_rejected int := 0;
  v_event_id uuid;
  v_name text;
  v_occurred timestamptz;
  v_props jsonb;
  v_session text;
  v_anon text;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'invalid events' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_events) > 25 THEN
    RAISE EXCEPTION 'batch too large' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_events)
  LOOP
    BEGIN
      BEGIN
        v_event_id := (v_item->>'event_id')::uuid;
        v_name := v_item->>'name';
        v_occurred := (v_item->>'occurred_at')::timestamptz;
      EXCEPTION WHEN others THEN
        v_rejected := v_rejected + 1;
        CONTINUE;
      END;
      IF v_event_id IS NULL OR v_name IS NULL OR v_occurred IS NULL THEN
        v_rejected := v_rejected + 1;
        CONTINUE;
      END IF;
      IF v_occurred > now() + interval '10 minutes' THEN
        v_rejected := v_rejected + 1;
        CONTINUE;
      END IF;
      IF v_occurred < now() - interval '7 days' THEN
        v_occurred := now();
      END IF;
      v_session := nullif(left(coalesce(v_item->>'session_id', ''), 80), '');
      v_anon := nullif(left(coalesce(v_item->>'anonymous_id', ''), 80), '');
      IF v_session IS NOT NULL AND char_length(v_session) < 8 THEN
        v_session := NULL;
      END IF;
      IF v_anon IS NOT NULL AND char_length(v_anon) < 8 THEN
        v_anon := NULL;
      END IF;
      v_props := public.analytics_sanitize_properties(v_item->'properties');

      INSERT INTO public.analytics_events (
        event_id, occurred_at, name, user_id, session_id, anonymous_id,
        room_id, job_id, product_id, properties, route, referrer,
        utm_source, utm_medium, utm_campaign, device, auth_method,
        source, consent_scope
      )
      VALUES (
        v_event_id,
        v_occurred,
        v_name,
        NULLIF(v_item->>'user_id', '')::uuid,
        v_session,
        v_anon,
        NULLIF(v_props->>'room_id', '')::uuid,
        NULLIF(v_props->>'job_id', '')::uuid,
        NULLIF(coalesce(v_props->>'product_id', v_props->>'curated_product_id'), ''),
        v_props,
        nullif(left(coalesce(v_item->>'route', v_item->'context'->>'route', ''), 200), ''),
        nullif(left(coalesce(v_item->>'referrer', v_item->'context'->>'referrer', ''), 200), ''),
        nullif(left(coalesce(v_item->>'utm_source', v_item->'context'->>'utm_source', ''), 80), ''),
        nullif(left(coalesce(v_item->>'utm_medium', v_item->'context'->>'utm_medium', ''), 80), ''),
        nullif(left(coalesce(v_item->>'utm_campaign', v_item->'context'->>'utm_campaign', ''), 80), ''),
        nullif(left(coalesce(v_item->>'device', v_item->'context'->>'device', ''), 16), ''),
        nullif(left(coalesce(v_item->>'auth_method', v_item->'context'->>'auth_method', ''), 16), ''),
        'client',
        'consented'
      )
      ON CONFLICT (event_id) DO NOTHING;

      IF FOUND THEN
        v_accepted := v_accepted + 1;
      ELSE
        v_duplicate := v_duplicate + 1;
      END IF;
    EXCEPTION WHEN check_violation THEN
      v_rejected := v_rejected + 1;
    WHEN others THEN
      v_rejected := v_rejected + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'accepted', v_accepted,
    'duplicate', v_duplicate,
    'rejected', v_rejected
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_analytics_events(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ingest_analytics_events(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.ingest_analytics_events(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_analytics_events(jsonb) TO service_role;

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

  -- Concurrent dashboard loads raced DELETE+INSERT and raised unique_violation (HTTP 409).
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

CREATE OR REPLACE FUNCTION public.purge_analytics_events()
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
  DELETE FROM public.analytics_events
  WHERE source = 'client'
    AND occurred_at < (now() - interval '25 months');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.maintain_analytics_store()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purged int;
  v_rollup int;
BEGIN
  IF NOT (
    current_user IN ('postgres', 'supabase_admin')
    OR coalesce(auth.role(), '') = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.is_admin(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  v_purged := public.purge_analytics_events();
  v_rollup := public.refresh_analytics_daily_rollups(CURRENT_DATE - 3, CURRENT_DATE);
  RETURN jsonb_build_object('purged', v_purged, 'rollup_rows', v_rollup);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_analytics_daily_rollups(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_analytics_daily_rollups(date, date) FROM anon;
REVOKE ALL ON FUNCTION public.purge_analytics_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_analytics_events() FROM anon;
REVOKE ALL ON FUNCTION public.purge_analytics_events() FROM authenticated;
REVOKE ALL ON FUNCTION public.maintain_analytics_store() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.maintain_analytics_store() FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_analytics_daily_rollups(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_analytics_daily_rollups(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_analytics_events() TO service_role;
GRANT EXECUTE ON FUNCTION public.maintain_analytics_store() TO authenticated;
GRANT EXECUTE ON FUNCTION public.maintain_analytics_store() TO service_role;

-- Trustworthy relational backfill (idempotent via stable event_id).
INSERT INTO public.analytics_events (
  event_id, occurred_at, name, user_id, session_id, anonymous_id,
  room_id, properties, source, consent_scope
)
SELECT
  public.analytics_stable_uuid('analytics-backfill:account_signed_up:' || p.id::text),
  p.created_at,
  'account_signed_up',
  p.id,
  'backfill-' || left(p.id::text, 8),
  'backfill-' || left(p.id::text, 8),
  NULL,
  jsonb_build_object('method', 'email'),
  'relational_backfill',
  'operational_backfill'
FROM public.profiles AS p
WHERE p.created_at IS NOT NULL
ON CONFLICT (event_id) DO NOTHING;

INSERT INTO public.analytics_events (
  event_id, occurred_at, name, user_id, session_id, anonymous_id,
  room_id, properties, source, consent_scope
)
SELECT
  public.analytics_stable_uuid('analytics-backfill:room_created:' || r.id::text),
  r.created_at,
  'room_created',
  r.user_id,
  'backfill-' || left(r.user_id::text, 8),
  'backfill-' || left(r.user_id::text, 8),
  r.id,
  jsonb_build_object('room_id', r.id::text, 'is_guest', false),
  'relational_backfill',
  'operational_backfill'
FROM public.rooms AS r
WHERE r.created_at IS NOT NULL
ON CONFLICT (event_id) DO NOTHING;

INSERT INTO public.analytics_events (
  event_id, occurred_at, name, user_id, session_id, anonymous_id,
  job_id, properties, source, consent_scope
)
SELECT
  public.analytics_stable_uuid('analytics-backfill:model_generation_started:' || j.id::text),
  j.created_at,
  'model_generation_started',
  j.user_id,
  'backfill-' || left(j.user_id::text, 8),
  'backfill-' || left(j.user_id::text, 8),
  j.id,
  jsonb_build_object('job_id', j.id::text, 'source_type', j.source),
  'relational_backfill',
  'operational_backfill'
FROM public.conversion_jobs AS j
ON CONFLICT (event_id) DO NOTHING;

INSERT INTO public.analytics_events (
  event_id, occurred_at, name, user_id, session_id, anonymous_id,
  job_id, properties, source, consent_scope
)
SELECT
  public.analytics_stable_uuid('analytics-backfill:model_generation_succeeded:' || j.id::text),
  coalesce(j.completed_at, j.updated_at, j.created_at),
  'model_generation_succeeded',
  j.user_id,
  'backfill-' || left(j.user_id::text, 8),
  'backfill-' || left(j.user_id::text, 8),
  j.id,
  jsonb_build_object(
    'job_id', j.id::text,
    'duration_ms', GREATEST(
      0,
      floor(EXTRACT(EPOCH FROM (coalesce(j.completed_at, j.updated_at) - j.created_at)) * 1000)
    )
  ),
  'relational_backfill',
  'operational_backfill'
FROM public.conversion_jobs AS j
WHERE j.status = 'completed'
ON CONFLICT (event_id) DO NOTHING;

INSERT INTO public.analytics_events (
  event_id, occurred_at, name, user_id, session_id, anonymous_id,
  job_id, properties, source, consent_scope
)
SELECT
  public.analytics_stable_uuid('analytics-backfill:model_generation_failed:' || j.id::text),
  coalesce(j.updated_at, j.created_at),
  'model_generation_failed',
  j.user_id,
  'backfill-' || left(j.user_id::text, 8),
  'backfill-' || left(j.user_id::text, 8),
  j.id,
  jsonb_build_object(
    'job_id', j.id::text,
    'failure_reason', left(coalesce(j.error, 'unknown'), 100)
  ),
  'relational_backfill',
  'operational_backfill'
FROM public.conversion_jobs AS j
WHERE j.status = 'failed'
ON CONFLICT (event_id) DO NOTHING;

INSERT INTO public.analytics_events (
  event_id, occurred_at, name, user_id, session_id, anonymous_id,
  room_id, properties, source, consent_scope
)
SELECT
  public.analytics_stable_uuid(
    'analytics-backfill:room_liked:' || rl.user_id::text || ':' || rl.room_id::text
  ),
  rl.created_at,
  'room_liked',
  rl.user_id,
  'backfill-' || left(rl.user_id::text, 8),
  'backfill-' || left(rl.user_id::text, 8),
  rl.room_id,
  jsonb_build_object('room_id', rl.room_id::text),
  'relational_backfill',
  'operational_backfill'
FROM public.room_likes AS rl
ON CONFLICT (event_id) DO NOTHING;

INSERT INTO public.analytics_events (
  event_id, occurred_at, name, user_id, session_id, anonymous_id,
  room_id, product_id, properties, source, consent_scope
)
SELECT
  public.analytics_stable_uuid(
    'analytics-backfill:checklist_item_added:' || usl.user_id::text || ':' || usl.room_id::text || ':' || usl.product_id::text
  ),
  usl.created_at,
  'checklist_item_added',
  usl.user_id,
  'backfill-' || left(usl.user_id::text, 8),
  'backfill-' || left(usl.user_id::text, 8),
  usl.room_id,
  usl.product_id::text,
  jsonb_build_object(
    'room_id', usl.room_id::text,
    'product_id', usl.product_id::text,
    'is_curated', true
  ),
  'relational_backfill',
  'operational_backfill'
FROM public.user_shopping_list AS usl
ON CONFLICT (event_id) DO NOTHING;

INSERT INTO public.analytics_events (
  event_id, occurred_at, name, user_id, session_id, anonymous_id,
  room_id, properties, source, consent_scope
)
SELECT
  public.analytics_stable_uuid('analytics-backfill:room_shared:' || rs.token),
  rs.created_at,
  'room_shared',
  rs.created_by,
  'backfill-' || left(rs.created_by::text, 8),
  'backfill-' || left(rs.created_by::text, 8),
  rs.room_id,
  jsonb_build_object('room_id', rs.room_id::text, 'role', rs.role::text),
  'relational_backfill',
  'operational_backfill'
FROM public.room_shares AS rs
ON CONFLICT (event_id) DO NOTHING;

SELECT public.refresh_analytics_daily_rollups(
  (SELECT coalesce(min(occurred_at)::date, CURRENT_DATE) FROM public.analytics_events),
  CURRENT_DATE
);
