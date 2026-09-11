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
