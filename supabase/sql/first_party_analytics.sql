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
-- Admin-only analytics query RPCs. Helpers are not granted to clients.

CREATE OR REPLACE FUNCTION public.analytics_row_in_scope(
  p_occurred_at timestamptz,
  p_user_id uuid,
  p_device text,
  p_auth_method text,
  p_consent_scope text,
  p_source text,
  p_from timestamptz,
  p_to timestamptz,
  p_filters jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_occurred_at >= p_from
    AND p_occurred_at < p_to
    AND (
      coalesce(p_filters->>'scope', 'all') = 'all'
      OR (p_filters->>'scope' = 'consented' AND p_consent_scope = 'consented' AND p_source = 'client')
      OR (p_filters->>'scope' = 'operational' AND p_consent_scope = 'operational_backfill')
    )
    AND (coalesce(p_filters->>'device', '') = '' OR p_device = p_filters->>'device')
    AND (coalesce(p_filters->>'auth_method', '') = '' OR p_auth_method = p_filters->>'auth_method')
    AND (
      coalesce(p_filters->>'user_type', 'all') = 'all'
      OR p_user_id IS NULL
      OR (
        p_filters->>'user_type' = 'new'
        AND EXISTS (
          SELECT 1 FROM public.profiles AS p
          WHERE p.id = p_user_id
            AND p.created_at >= p_from
            AND p.created_at < p_to
        )
      )
      OR (
        p_filters->>'user_type' = 'returning'
        AND EXISTS (
          SELECT 1 FROM public.profiles AS p
          WHERE p.id = p_user_id
            AND p.created_at < p_from
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.analytics_row_in_scope(
  timestamptz, uuid, text, text, text, text, timestamptz, timestamptz, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_row_in_scope(
  timestamptz, uuid, text, text, text, text, timestamptz, timestamptz, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.analytics_row_in_scope(
  timestamptz, uuid, text, text, text, text, timestamptz, timestamptz, jsonb
) FROM authenticated;

CREATE OR REPLACE FUNCTION public.analytics_kpi_obj(
  p_key text,
  p_label text,
  p_curr numeric,
  p_prev numeric,
  p_scope text,
  p_unavailable boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'key', p_key,
    'label', p_label,
    'value', coalesce(p_curr, 0),
    'previous', coalesce(p_prev, 0),
    'delta_pct', public.analytics_delta_pct(p_curr, p_prev),
    'scope', p_scope,
    'unavailable', p_unavailable
  );
$$;

REVOKE ALL ON FUNCTION public.analytics_kpi_obj(text, text, numeric, numeric, text, boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.analytics_count_series(
  p_from timestamptz,
  p_to timestamptz,
  p_filters jsonb,
  p_name text,
  p_distinct text DEFAULT 'events'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hourly boolean;
  v_out jsonb;
BEGIN
  v_hourly := (p_to - p_from) <= interval '48 hours';
  IF v_hourly THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('t', s.bucket, 'v', s.cnt) ORDER BY s.bucket), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT
        gs.bucket,
        CASE
          WHEN p_distinct = 'users' THEN count(DISTINCT e.user_id)::bigint
          WHEN p_distinct = 'sessions' THEN count(DISTINCT e.session_id)::bigint
          ELSE count(e.id)::bigint
        END AS cnt
      FROM generate_series(
        date_trunc('hour', p_from),
        date_trunc('hour', p_to),
        interval '1 hour'
      ) AS gs(bucket)
      LEFT JOIN public.analytics_events AS e
        ON date_trunc('hour', e.occurred_at) = gs.bucket
       AND (p_name IS NULL OR e.name = p_name)
       AND public.analytics_row_in_scope(
         e.occurred_at, e.user_id, e.device, e.auth_method, e.consent_scope, e.source,
         p_from, p_to, p_filters
       )
      GROUP BY gs.bucket
    ) AS s;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('t', s.bucket, 'v', s.cnt) ORDER BY s.bucket), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT
        gs.bucket::date AS bucket,
        CASE
          WHEN p_distinct = 'users' THEN count(DISTINCT e.user_id)::bigint
          WHEN p_distinct = 'sessions' THEN count(DISTINCT e.session_id)::bigint
          ELSE count(e.id)::bigint
        END AS cnt
      FROM generate_series(p_from::date, (p_to - interval '1 second')::date, interval '1 day') AS gs(bucket)
      LEFT JOIN public.analytics_events AS e
        ON e.occurred_at::date = gs.bucket::date
       AND (p_name IS NULL OR e.name = p_name)
       AND public.analytics_row_in_scope(
         e.occurred_at, e.user_id, e.device, e.auth_method, e.consent_scope, e.source,
         p_from, p_to, p_filters
       )
      GROUP BY gs.bucket
    ) AS s;
  END IF;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_count_series(timestamptz, timestamptz, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_count_series(timestamptz, timestamptz, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.analytics_count_series(timestamptz, timestamptz, jsonb, text, text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_analytics(
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to timestamptz DEFAULT now(),
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
  v_to timestamptz;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_filters jsonb;
  v_payload jsonb;
  v_events_since timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_to := least(coalesce(p_to, now()), now() + interval '1 hour');
  v_from := coalesce(p_from, v_to - interval '30 days');
  IF v_from >= v_to THEN
    v_from := v_to - interval '30 days';
  END IF;
  IF v_to - v_from > interval '800 days' THEN
    v_from := v_to - interval '800 days';
  END IF;
  v_prev_to := v_from;
  v_prev_from := v_from - (v_to - v_from);
  v_filters := coalesce(p_filters, '{}'::jsonb);

  SELECT min(e.occurred_at) INTO v_events_since
  FROM public.analytics_events AS e
  WHERE e.source = 'client';

  BEGIN
    PERFORM public.refresh_analytics_daily_rollups(v_from::date, v_to::date);
  EXCEPTION
    WHEN unique_violation OR deadlock_detected OR serialization_failure THEN
      NULL;
  END;

  WITH
  cur AS (
    SELECT *
    FROM public.analytics_events AS e
    WHERE public.analytics_row_in_scope(
      e.occurred_at, e.user_id, e.device, e.auth_method, e.consent_scope, e.source,
      v_from, v_to, v_filters
    )
  ),
  prev AS (
    SELECT *
    FROM public.analytics_events AS e
    WHERE public.analytics_row_in_scope(
      e.occurred_at, e.user_id, e.device, e.auth_method, e.consent_scope, e.source,
      v_prev_from, v_prev_to, v_filters
    )
  ),
  kpis AS (
    SELECT jsonb_build_array(
      jsonb_build_object(
        'key', 'active_users', 'label', 'Active users',
        'value', (SELECT count(DISTINCT user_id) FROM cur WHERE user_id IS NOT NULL),
        'previous', (SELECT count(DISTINCT user_id) FROM prev WHERE user_id IS NOT NULL),
        'delta_pct', public.analytics_delta_pct(
          (SELECT count(DISTINCT user_id) FROM cur WHERE user_id IS NOT NULL),
          (SELECT count(DISTINCT user_id) FROM prev WHERE user_id IS NOT NULL)
        ),
        'scope', 'consented'
      ),
      jsonb_build_object(
        'key', 'sessions', 'label', 'Sessions',
        'value', (SELECT count(DISTINCT session_id) FROM cur WHERE session_id IS NOT NULL),
        'previous', (SELECT count(DISTINCT session_id) FROM prev WHERE session_id IS NOT NULL),
        'delta_pct', public.analytics_delta_pct(
          (SELECT count(DISTINCT session_id) FROM cur WHERE session_id IS NOT NULL),
          (SELECT count(DISTINCT session_id) FROM prev WHERE session_id IS NOT NULL)
        ),
        'scope', 'consented'
      ),
      jsonb_build_object(
        'key', 'signups', 'label', 'Signups',
        'value', (SELECT count(*) FROM public.profiles WHERE created_at >= v_from AND created_at < v_to),
        'previous', (SELECT count(*) FROM public.profiles WHERE created_at >= v_prev_from AND created_at < v_prev_to),
        'delta_pct', public.analytics_delta_pct(
          (SELECT count(*) FROM public.profiles WHERE created_at >= v_from AND created_at < v_to),
          (SELECT count(*) FROM public.profiles WHERE created_at >= v_prev_from AND created_at < v_prev_to)
        ),
        'scope', 'operational'
      ),
      jsonb_build_object(
        'key', 'rooms', 'label', 'Rooms created',
        'value', (SELECT count(*) FROM public.rooms WHERE created_at >= v_from AND created_at < v_to),
        'previous', (SELECT count(*) FROM public.rooms WHERE created_at >= v_prev_from AND created_at < v_prev_to),
        'delta_pct', public.analytics_delta_pct(
          (SELECT count(*) FROM public.rooms WHERE created_at >= v_from AND created_at < v_to),
          (SELECT count(*) FROM public.rooms WHERE created_at >= v_prev_from AND created_at < v_prev_to)
        ),
        'scope', 'operational'
      ),
      jsonb_build_object(
        'key', 'placements', 'label', 'Placements',
        'value', (SELECT count(*) FROM cur WHERE name = 'design_item_added'),
        'previous', (SELECT count(*) FROM prev WHERE name = 'design_item_added'),
        'delta_pct', public.analytics_delta_pct(
          (SELECT count(*) FROM cur WHERE name = 'design_item_added'),
          (SELECT count(*) FROM prev WHERE name = 'design_item_added')
        ),
        'scope', 'consented'
      ),
      jsonb_build_object(
        'key', 'generations', 'label', 'Generations',
        'value', (SELECT count(*) FROM public.conversion_jobs WHERE created_at >= v_from AND created_at < v_to),
        'previous', (SELECT count(*) FROM public.conversion_jobs WHERE created_at >= v_prev_from AND created_at < v_prev_to),
        'delta_pct', public.analytics_delta_pct(
          (SELECT count(*) FROM public.conversion_jobs WHERE created_at >= v_from AND created_at < v_to),
          (SELECT count(*) FROM public.conversion_jobs WHERE created_at >= v_prev_from AND created_at < v_prev_to)
        ),
        'scope', 'operational'
      ),
      jsonb_build_object(
        'key', 'shares', 'label', 'Shares',
        'value', (SELECT count(*) FROM cur WHERE name = 'room_shared'),
        'previous', (SELECT count(*) FROM prev WHERE name = 'room_shared'),
        'delta_pct', public.analytics_delta_pct(
          (SELECT count(*) FROM cur WHERE name = 'room_shared'),
          (SELECT count(*) FROM prev WHERE name = 'room_shared')
        ),
        'scope', 'mixed'
      ),
      jsonb_build_object(
        'key', 'likes', 'label', 'Likes',
        'value', (SELECT count(*) FROM public.room_likes WHERE created_at >= v_from AND created_at < v_to),
        'previous', (SELECT count(*) FROM public.room_likes WHERE created_at >= v_prev_from AND created_at < v_prev_to),
        'delta_pct', public.analytics_delta_pct(
          (SELECT count(*) FROM public.room_likes WHERE created_at >= v_from AND created_at < v_to),
          (SELECT count(*) FROM public.room_likes WHERE created_at >= v_prev_from AND created_at < v_prev_to)
        ),
        'scope', 'operational'
      ),
      jsonb_build_object(
        'key', 'checklist_adds', 'label', 'Checklist adds',
        'value', (SELECT count(*) FROM public.user_shopping_list WHERE created_at >= v_from AND created_at < v_to),
        'previous', (SELECT count(*) FROM public.user_shopping_list WHERE created_at >= v_prev_from AND created_at < v_prev_to),
        'delta_pct', public.analytics_delta_pct(
          (SELECT count(*) FROM public.user_shopping_list WHERE created_at >= v_from AND created_at < v_to),
          (SELECT count(*) FROM public.user_shopping_list WHERE created_at >= v_prev_from AND created_at < v_prev_to)
        ),
        'scope', 'operational'
      ),
      jsonb_build_object(
        'key', 'affiliate_clicks', 'label', 'Affiliate clicks',
        'value', (SELECT count(*) FROM cur WHERE name = 'product_affiliate_clicked'),
        'previous', (SELECT count(*) FROM prev WHERE name = 'product_affiliate_clicked'),
        'delta_pct', public.analytics_delta_pct(
          (SELECT count(*) FROM cur WHERE name = 'product_affiliate_clicked'),
          (SELECT count(*) FROM prev WHERE name = 'product_affiliate_clicked')
        ),
        'scope', 'consented'
      ),
      jsonb_build_object(
        'key', 'activation', 'label', 'Activated (room)',
        'value', (
          SELECT count(DISTINCT p.id)
          FROM public.profiles AS p
          JOIN public.rooms AS r ON r.user_id = p.id
          WHERE p.created_at >= v_from AND p.created_at < v_to
        ),
        'previous', (
          SELECT count(DISTINCT p.id)
          FROM public.profiles AS p
          JOIN public.rooms AS r ON r.user_id = p.id
          WHERE p.created_at >= v_prev_from AND p.created_at < v_prev_to
        ),
        'delta_pct', public.analytics_delta_pct(
          (
            SELECT count(DISTINCT p.id)
            FROM public.profiles AS p
            JOIN public.rooms AS r ON r.user_id = p.id
            WHERE p.created_at >= v_from AND p.created_at < v_to
          ),
          (
            SELECT count(DISTINCT p.id)
            FROM public.profiles AS p
            JOIN public.rooms AS r ON r.user_id = p.id
            WHERE p.created_at >= v_prev_from AND p.created_at < v_prev_to
          )
        ),
        'scope', 'operational'
      ),
      jsonb_build_object(
        'key', 'billing_placeholder', 'label', 'Plan upgrades',
        'value', 0,
        'previous', 0,
        'delta_pct', NULL,
        'scope', 'consented',
        'unavailable', true
      )
    ) AS arr
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'previous_range', jsonb_build_object('from', v_prev_from, 'to', v_prev_to),
    'events_since', v_events_since,
    'kpis', (SELECT arr FROM kpis),
    'timeseries', jsonb_build_object(
      'active_users', jsonb_build_object(
        'key', 'active_users', 'label', 'Active users', 'unit', 'users',
        'points', public.analytics_count_series(v_from, v_to, v_filters, NULL, 'users')
      ),
      'sessions', jsonb_build_object(
        'key', 'sessions', 'label', 'Sessions', 'unit', 'sessions',
        'points', public.analytics_count_series(v_from, v_to, v_filters, 'session_started', 'sessions')
      ),
      'signups', jsonb_build_object(
        'key', 'signups', 'label', 'Signups', 'unit', 'users',
        'points', public.analytics_count_series(v_from, v_to, v_filters, 'account_signed_up', 'events')
      ),
      'rooms', jsonb_build_object(
        'key', 'rooms', 'label', 'Rooms', 'unit', 'rooms',
        'points', public.analytics_count_series(v_from, v_to, v_filters, 'room_created', 'events')
      ),
      'placements', jsonb_build_object(
        'key', 'placements', 'label', 'Placements', 'unit', 'events',
        'points', public.analytics_count_series(v_from, v_to, v_filters, 'design_item_added', 'events')
      ),
      'generations', jsonb_build_object(
        'key', 'generations', 'label', 'Generations', 'unit', 'jobs',
        'points', public.analytics_count_series(v_from, v_to, v_filters, 'model_generation_started', 'events')
      ),
      'affiliate_clicks', jsonb_build_object(
        'key', 'affiliate_clicks', 'label', 'Affiliate clicks', 'unit', 'clicks',
        'points', public.analytics_count_series(v_from, v_to, v_filters, 'product_affiliate_clicked', 'events')
      )
    ),
    'stickiness', jsonb_build_object(
      'dau', (
        SELECT count(DISTINCT user_id) FROM public.analytics_events
        WHERE occurred_at >= v_to - interval '1 day' AND occurred_at < v_to AND user_id IS NOT NULL
      ),
      'wau', (
        SELECT count(DISTINCT user_id) FROM public.analytics_events
        WHERE occurred_at >= v_to - interval '7 days' AND occurred_at < v_to AND user_id IS NOT NULL
      ),
      'mau', (
        SELECT count(DISTINCT user_id) FROM public.analytics_events
        WHERE occurred_at >= v_to - interval '30 days' AND occurred_at < v_to AND user_id IS NOT NULL
      )
    ),
    'funnels', jsonb_build_object(
      'activation', jsonb_build_array(
        jsonb_build_object('key', 'visit', 'label', 'Visits', 'value', (SELECT count(DISTINCT coalesce(user_id::text, session_id)) FROM cur WHERE name IN ('page_view', 'session_started'))),
        jsonb_build_object('key', 'signup', 'label', 'Signups', 'value', (SELECT count(*) FROM public.profiles WHERE created_at >= v_from AND created_at < v_to)),
        jsonb_build_object('key', 'room', 'label', 'Created a room', 'value', (SELECT count(DISTINCT user_id) FROM public.rooms WHERE created_at >= v_from AND created_at < v_to)),
        jsonb_build_object('key', 'placement', 'label', 'Placed an item', 'value', (SELECT count(DISTINCT user_id) FROM cur WHERE name = 'design_item_added' AND user_id IS NOT NULL))
      ),
      'commerce', jsonb_build_array(
        jsonb_build_object('key', 'search', 'label', 'Searches', 'value', (SELECT count(*) FROM cur WHERE name = 'catalog_searched')),
        jsonb_build_object('key', 'checklist', 'label', 'Checklist adds', 'value', (SELECT count(*) FROM cur WHERE name = 'checklist_item_added')),
        jsonb_build_object('key', 'affiliate', 'label', 'Affiliate clicks', 'value', (SELECT count(*) FROM cur WHERE name = 'product_affiliate_clicked')),
        jsonb_build_object('key', 'purchase', 'label', 'Purchases', 'value', 0, 'unavailable', true)
      )
    ),
    'cohorts', (
      SELECT coalesce(jsonb_agg(row_to_json(c) ORDER BY c.cohort DESC), '[]'::jsonb)
      FROM (
        SELECT
          date_trunc('week', p.created_at)::date AS cohort,
          count(*)::bigint AS size,
          count(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM public.analytics_events AS e
              WHERE e.user_id = p.id
                AND e.occurred_at >= p.created_at
                AND e.occurred_at < p.created_at + interval '1 day'
            )
          )::bigint AS d1,
          count(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM public.analytics_events AS e
              WHERE e.user_id = p.id
                AND e.occurred_at >= p.created_at
                AND e.occurred_at < p.created_at + interval '7 days'
            )
          )::bigint AS d7,
          count(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM public.analytics_events AS e
              WHERE e.user_id = p.id
                AND e.occurred_at >= p.created_at
                AND e.occurred_at < p.created_at + interval '30 days'
            )
          )::bigint AS d30
        FROM public.profiles AS p
        WHERE p.created_at >= v_to - interval '8 weeks'
          AND p.created_at < v_to
        GROUP BY 1
        LIMIT 12
      ) AS c
    ),
    'breakdowns', jsonb_build_object(
      'events', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', name, 'label', name, 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (SELECT name, count(*)::bigint AS cnt FROM cur GROUP BY name) s
      ),
      'device', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', coalesce(device, 'unknown'), 'label', coalesce(device, 'unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (SELECT device, count(*)::bigint AS cnt FROM cur GROUP BY device) s
      ),
      'auth_method', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', coalesce(auth_method, 'unknown'), 'label', coalesce(auth_method, 'unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (SELECT auth_method, count(*)::bigint AS cnt FROM cur GROUP BY auth_method) s
      ),
      'utm_source', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', coalesce(utm_source, 'direct'), 'label', coalesce(utm_source, 'direct'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (SELECT utm_source, count(*)::bigint AS cnt FROM cur GROUP BY utm_source) s
      ),
      'templates', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', coalesce(template_id, 'none'), 'label', coalesce(template_id, 'none'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (SELECT count(*)::bigint AS cnt, properties->>'template_id' AS template_id FROM cur WHERE name = 'room_created' GROUP BY 2) s
      ),
      'item_kind', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', coalesce(kind, 'unknown'), 'label', coalesce(kind, 'unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (
          SELECT ri.kind, count(*)::bigint AS cnt
          FROM public.room_items AS ri
          GROUP BY ri.kind
          ORDER BY cnt DESC
          LIMIT 20
        ) s
      ),
      'item_source', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', coalesce(source, 'unknown'), 'label', coalesce(source, 'unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (SELECT properties->>'source' AS source, count(*)::bigint AS cnt FROM cur WHERE name = 'design_item_added' GROUP BY 1) s
      ),
      'search_context', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', coalesce(context, 'unknown'), 'label', coalesce(context, 'unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (SELECT properties->>'context' AS context, count(*)::bigint AS cnt FROM cur WHERE name = 'catalog_searched' GROUP BY 1) s
      ),
      'top_queries', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', q, 'label', q, 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (
          SELECT left(properties->>'query', 80) AS q, count(*)::bigint AS cnt
          FROM cur
          WHERE name = 'catalog_searched' AND coalesce(properties->>'query', '') <> ''
          GROUP BY 1
          ORDER BY cnt DESC
          LIMIT 20
        ) s
      ),
      'affiliate_retailer', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', coalesce(retailer, 'unknown'), 'label', coalesce(retailer, 'unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (SELECT properties->>'retailer' AS retailer, count(*)::bigint AS cnt FROM cur WHERE name = 'product_affiliate_clicked' GROUP BY 1) s
      ),
      'affiliate_surface', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', coalesce(source, 'unknown'), 'label', coalesce(source, 'unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (SELECT properties->>'source' AS source, count(*)::bigint AS cnt FROM cur WHERE name = 'product_affiliate_clicked' GROUP BY 1) s
      ),
      'share_role', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', coalesce(role, 'unknown'), 'label', coalesce(role, 'unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (SELECT properties->>'role' AS role, count(*)::bigint AS cnt FROM cur WHERE name = 'room_shared' GROUP BY 1) s
      ),
      'visibility', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', visibility, 'label', visibility, 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (
          SELECT r.visibility, count(*)::bigint AS cnt
          FROM public.rooms AS r
          GROUP BY r.visibility
        ) s
      ),
      'generation_source', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', source, 'label', source, 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (
          SELECT j.source, count(*)::bigint AS cnt
          FROM public.conversion_jobs AS j
          WHERE j.created_at >= v_from AND j.created_at < v_to
          GROUP BY j.source
        ) s
      ),
      'generation_status', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', status, 'label', status, 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (
          SELECT j.status, count(*)::bigint AS cnt
          FROM public.conversion_jobs AS j
          WHERE j.created_at >= v_from AND j.created_at < v_to
          GROUP BY j.status
        ) s
      )
    ),
    'reliability', jsonb_build_object(
      'started', (SELECT count(*) FROM public.conversion_jobs WHERE created_at >= v_from AND created_at < v_to),
      'succeeded', (SELECT count(*) FROM public.conversion_jobs WHERE created_at >= v_from AND created_at < v_to AND status = 'completed'),
      'failed', (SELECT count(*) FROM public.conversion_jobs WHERE created_at >= v_from AND created_at < v_to AND status = 'failed'),
      'success_rate', (
        SELECT CASE WHEN count(*) = 0 THEN NULL
          ELSE round((count(*) FILTER (WHERE status = 'completed'))::numeric / count(*) * 1000) / 10
        END
        FROM public.conversion_jobs
        WHERE created_at >= v_from AND created_at < v_to
      ),
      'p50_ms', (
        SELECT percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (coalesce(completed_at, updated_at) - created_at)) * 1000
        )
        FROM public.conversion_jobs
        WHERE created_at >= v_from AND created_at < v_to AND status = 'completed'
      ),
      'p95_ms', (
        SELECT percentile_cont(0.95) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (coalesce(completed_at, updated_at) - created_at)) * 1000
        )
        FROM public.conversion_jobs
        WHERE created_at >= v_from AND created_at < v_to AND status = 'completed'
      ),
      'failure_reasons', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', reason, 'label', reason, 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (
          SELECT left(coalesce(properties->>'failure_reason', 'unknown'), 80) AS reason, count(*)::bigint AS cnt
          FROM cur
          WHERE name = 'model_generation_failed'
          GROUP BY 1
          LIMIT 12
        ) s
      )
    ),
    'search', jsonb_build_object(
      'total', (SELECT count(*) FROM cur WHERE name = 'catalog_searched'),
      'zero_results', (
        SELECT count(*) FROM cur
        WHERE name = 'catalog_searched'
          AND coalesce((properties->>'results_count')::numeric, 0) = 0
      )
    ),
    'community', jsonb_build_object(
      'public_rooms', (SELECT count(*) FROM public.rooms WHERE visibility = 'public'),
      'private_rooms', (SELECT count(*) FROM public.rooms WHERE visibility IS DISTINCT FROM 'public'),
      'public_models', (SELECT count(*) FROM public.furniture_catalog WHERE is_builtin = false AND visibility = 'public'),
      'reports', (SELECT count(*) FROM public.content_reports WHERE created_at >= v_from AND created_at < v_to)
    ),
    'explorer', jsonb_build_object(
      'total', (SELECT count(*) FROM cur),
      'events', (
        SELECT coalesce(jsonb_agg(ev ORDER BY ev.occurred_at DESC), '[]'::jsonb)
        FROM (
          SELECT
            e.id,
            e.occurred_at,
            e.name,
            e.user_id,
            p.handle,
            p.display_name,
            e.session_id,
            e.route,
            e.device,
            e.source,
            e.consent_scope,
            e.properties
          FROM cur AS e
          LEFT JOIN public.profiles AS p ON p.id = e.user_id
          ORDER BY e.occurred_at DESC
          LIMIT 40
        ) AS ev
      )
    ),
    'health', jsonb_build_object(
      'ingested_24h', (
        SELECT count(*) FROM public.analytics_events
        WHERE received_at >= now() - interval '24 hours' AND source = 'client'
      ),
      'last_event_at', (
        SELECT max(occurred_at) FROM public.analytics_events WHERE source = 'client'
      ),
      'backfill_rows', (
        SELECT count(*) FROM public.analytics_events WHERE source = 'relational_backfill'
      ),
      'rejected_placeholder', 0
    )
  )
  INTO v_payload;

  v_payload := jsonb_set(
    v_payload,
    '{stickiness,dau_wau}',
    to_jsonb(
      CASE
        WHEN (v_payload->'stickiness'->>'wau')::numeric = 0 THEN NULL
        ELSE round((v_payload->'stickiness'->>'dau')::numeric / (v_payload->'stickiness'->>'wau')::numeric * 1000) / 10
      END
    )
  );
  v_payload := jsonb_set(
    v_payload,
    '{stickiness,dau_mau}',
    to_jsonb(
      CASE
        WHEN (v_payload->'stickiness'->>'mau')::numeric = 0 THEN NULL
        ELSE round((v_payload->'stickiness'->>'dau')::numeric / (v_payload->'stickiness'->>'mau')::numeric * 1000) / 10
      END
    )
  );

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_analytics(timestamptz, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_analytics(timestamptz, timestamptz, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics(timestamptz, timestamptz, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_analytics_events(
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to timestamptz DEFAULT now(),
  p_name text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int;
  v_offset int;
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  v_limit := GREATEST(1, LEAST(coalesce(p_limit, 50), 100));
  v_offset := GREATEST(0, coalesce(p_offset, 0));

  SELECT jsonb_build_object(
    'total', (
      SELECT count(*)
      FROM public.analytics_events AS e
      WHERE e.occurred_at >= p_from
        AND e.occurred_at < p_to
        AND (p_name IS NULL OR e.name = p_name)
        AND (p_user_id IS NULL OR e.user_id = p_user_id)
    ),
    'events', (
      SELECT coalesce(jsonb_agg(row_to_json(ev)), '[]'::jsonb)
      FROM (
        SELECT
          e.id,
          e.occurred_at,
          e.name,
          e.user_id,
          p.handle,
          p.display_name,
          e.session_id,
          e.route,
          e.device,
          e.source,
          e.consent_scope,
          e.properties
        FROM public.analytics_events AS e
        LEFT JOIN public.profiles AS p ON p.id = e.user_id
        WHERE e.occurred_at >= p_from
          AND e.occurred_at < p_to
          AND (p_name IS NULL OR e.name = p_name)
          AND (p_user_id IS NULL OR e.user_id = p_user_id)
        ORDER BY e.occurred_at DESC
        LIMIT v_limit OFFSET v_offset
      ) AS ev
    )
  )
  INTO v_payload;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_analytics_events(timestamptz, timestamptz, text, uuid, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_analytics_events(timestamptz, timestamptz, text, uuid, int, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics_events(timestamptz, timestamptz, text, uuid, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_user_analytics(
  p_user_id uuid,
  p_from timestamptz DEFAULT (now() - interval '90 days'),
  p_to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_from timestamptz;
  v_to timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_to := coalesce(p_to, now());
  v_from := coalesce(p_from, v_to - interval '90 days');

  SELECT jsonb_build_object(
    'generated_at', now(),
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'totals', jsonb_build_object(
      'events', (SELECT count(*) FROM public.analytics_events WHERE user_id = p_user_id AND occurred_at >= v_from AND occurred_at < v_to),
      'sessions', (SELECT count(DISTINCT session_id) FROM public.analytics_events WHERE user_id = p_user_id AND occurred_at >= v_from AND occurred_at < v_to),
      'page_views', (SELECT count(*) FROM public.analytics_events WHERE user_id = p_user_id AND name = 'page_view' AND occurred_at >= v_from AND occurred_at < v_to),
      'searches', (SELECT count(*) FROM public.analytics_events WHERE user_id = p_user_id AND name = 'catalog_searched' AND occurred_at >= v_from AND occurred_at < v_to),
      'affiliate_clicks', (SELECT count(*) FROM public.analytics_events WHERE user_id = p_user_id AND name = 'product_affiliate_clicked' AND occurred_at >= v_from AND occurred_at < v_to),
      'checklist_adds', (SELECT count(*) FROM public.user_shopping_list WHERE user_id = p_user_id AND created_at >= v_from AND created_at < v_to)
    ),
    'series', jsonb_build_array(
      jsonb_build_object(
        'key', 'events_daily', 'label', 'Events', 'unit', 'count',
        'points', (
          SELECT coalesce(jsonb_agg(jsonb_build_object('t', s.bucket, 'v', s.cnt) ORDER BY s.bucket), '[]'::jsonb)
          FROM (
            SELECT gs.bucket::date AS bucket, count(e.id)::bigint AS cnt
            FROM generate_series(v_from::date, (v_to - interval '1 second')::date, interval '1 day') AS gs(bucket)
            LEFT JOIN public.analytics_events AS e
              ON e.occurred_at::date = gs.bucket::date
             AND e.user_id = p_user_id
            GROUP BY gs.bucket
          ) AS s
        )
      ),
      jsonb_build_object(
        'key', 'sessions_daily', 'label', 'Sessions', 'unit', 'count',
        'points', (
          SELECT coalesce(jsonb_agg(jsonb_build_object('t', s.bucket, 'v', s.cnt) ORDER BY s.bucket), '[]'::jsonb)
          FROM (
            SELECT gs.bucket::date AS bucket, count(DISTINCT e.session_id)::bigint AS cnt
            FROM generate_series(v_from::date, (v_to - interval '1 second')::date, interval '1 day') AS gs(bucket)
            LEFT JOIN public.analytics_events AS e
              ON e.occurred_at::date = gs.bucket::date
             AND e.user_id = p_user_id
             AND e.name = 'session_started'
            GROUP BY gs.bucket
          ) AS s
        )
      )
    ),
    'funnel', jsonb_build_array(
      jsonb_build_object(
        'key', 'signup', 'label', 'Signed up',
        'at', (SELECT created_at FROM public.profiles WHERE id = p_user_id)
      ),
      jsonb_build_object(
        'key', 'room', 'label', 'Created a room',
        'at', (SELECT min(created_at) FROM public.rooms WHERE user_id = p_user_id)
      ),
      jsonb_build_object(
        'key', 'placement', 'label', 'Placed an item',
        'at', (SELECT min(occurred_at) FROM public.analytics_events WHERE user_id = p_user_id AND name = 'design_item_added')
      ),
      jsonb_build_object(
        'key', 'generation', 'label', 'Started a generation',
        'at', (SELECT min(created_at) FROM public.conversion_jobs WHERE user_id = p_user_id)
      ),
      jsonb_build_object(
        'key', 'share', 'label', 'Shared a room',
        'at', (SELECT min(occurred_at) FROM public.analytics_events WHERE user_id = p_user_id AND name = 'room_shared')
      )
    ),
    'breakdowns', jsonb_build_object(
      'events', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', name, 'label', name, 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (
          SELECT name, count(*)::bigint AS cnt
          FROM public.analytics_events
          WHERE user_id = p_user_id AND occurred_at >= v_from AND occurred_at < v_to
          GROUP BY name
        ) s
      ),
      'search_context', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', coalesce(context, 'unknown'), 'label', coalesce(context, 'unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (
          SELECT properties->>'context' AS context, count(*)::bigint AS cnt
          FROM public.analytics_events
          WHERE user_id = p_user_id AND name = 'catalog_searched' AND occurred_at >= v_from AND occurred_at < v_to
          GROUP BY 1
        ) s
      ),
      'affiliate_surface', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', coalesce(source, 'unknown'), 'label', coalesce(source, 'unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (
          SELECT properties->>'source' AS source, count(*)::bigint AS cnt
          FROM public.analytics_events
          WHERE user_id = p_user_id AND name = 'product_affiliate_clicked' AND occurred_at >= v_from AND occurred_at < v_to
          GROUP BY 1
        ) s
      ),
      'generation_status', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('key', status, 'label', status, 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (
          SELECT status, count(*)::bigint AS cnt
          FROM public.conversion_jobs
          WHERE user_id = p_user_id AND created_at >= v_from AND created_at < v_to
          GROUP BY status
        ) s
      )
    ),
    'recent_events', (
      SELECT coalesce(jsonb_agg(row_to_json(ev)), '[]'::jsonb)
      FROM (
        SELECT id, occurred_at, name, route, device, source, consent_scope, properties
        FROM public.analytics_events
        WHERE user_id = p_user_id
        ORDER BY occurred_at DESC
        LIMIT 30
      ) AS ev
    )
  )
  INTO v_payload;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_analytics(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_user_analytics(uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_user_analytics(uuid, timestamptz, timestamptz) TO authenticated;

-- Fill the reserved user-overview analytics envelope with real series/extras.
CREATE OR REPLACE FUNCTION public.get_admin_user_overview(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
  v_analytics jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

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
      'plan', 'free'
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

COMMENT ON FUNCTION public.get_admin_analytics(timestamptz, timestamptz, jsonb) IS
  'Admin-only: global analytics dashboard payload (KPIs, series, funnels, cohorts, explorer).';
COMMENT ON FUNCTION public.get_admin_analytics_events(timestamptz, timestamptz, text, uuid, int, int) IS
  'Admin-only: paginated analytics event explorer.';
COMMENT ON FUNCTION public.get_admin_user_analytics(uuid, timestamptz, timestamptz) IS
  'Admin-only: per-user analytics series, funnel, and recent events.';
COMMENT ON FUNCTION public.get_admin_user_overview(uuid) IS
  'Admin-only: condensed user profile, rooms, models, and filled analytics envelope.';
