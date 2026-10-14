-- Relational retention metrics (rooms / room_items / conversion_jobs / last_active_at).
-- Cookie-consented analytics_events undercount; this RPC is the source of truth for retention.

CREATE OR REPLACE FUNCTION public.admin_retention_relational(
  p_from timestamptz DEFAULT (now() - interval '90 days'),
  p_to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
  v_to timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_to := least(coalesce(p_to, now()), now() + interval '1 hour');
  v_from := coalesce(p_from, v_to - interval '90 days');
  IF v_from >= v_to THEN
    v_from := v_to - interval '90 days';
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'activation', (
      WITH cohort AS (
        SELECT p.id, p.created_at
        FROM public.profiles AS p
        WHERE p.created_at >= v_from
          AND p.created_at < v_to
      ),
      item_counts AS (
        SELECT r.user_id, count(ri.id)::bigint AS n
        FROM public.rooms AS r
        JOIN public.room_items AS ri ON ri.room_id = r.id
        WHERE r.user_id IN (SELECT id FROM cohort)
        GROUP BY r.user_id
      ),
      ai_ok AS (
        SELECT DISTINCT cj.user_id
        FROM public.conversion_jobs AS cj
        WHERE cj.user_id IN (SELECT id FROM cohort)
          AND cj.status = 'completed'
          AND cj.completed_at IS NOT NULL
          AND cj.completed_at < (
            SELECT c.created_at + interval '24 hours'
            FROM cohort AS c
            WHERE c.id = cj.user_id
          )
      ),
      early_rooms AS (
        -- room_items has no created_at; treat rooms created within 24h of signup
        -- that currently have 5+ items as the items half of activation.
        SELECT r.user_id, count(ri.id)::bigint AS n
        FROM public.rooms AS r
        JOIN cohort AS c ON c.id = r.user_id
        JOIN public.room_items AS ri ON ri.room_id = r.id
        WHERE r.created_at < c.created_at + interval '24 hours'
        GROUP BY r.user_id
      )
      SELECT jsonb_build_object(
        'signups', (SELECT count(*)::bigint FROM cohort),
        'with_room', (
          SELECT count(DISTINCT r.user_id)::bigint
          FROM public.rooms AS r
          WHERE r.user_id IN (SELECT id FROM cohort)
        ),
        'items_5_plus', (
          SELECT count(*)::bigint FROM item_counts WHERE n >= 5
        ),
        'activated_24h', (
          SELECT count(*)::bigint
          FROM cohort AS c
          WHERE EXISTS (SELECT 1 FROM early_rooms AS i WHERE i.user_id = c.id AND i.n >= 5)
            AND EXISTS (SELECT 1 FROM ai_ok AS a WHERE a.user_id = c.id)
        ),
        'funnel', jsonb_build_array(
          jsonb_build_object(
            'key', 'signup',
            'label', 'Signups',
            'value', (SELECT count(*)::bigint FROM cohort)
          ),
          jsonb_build_object(
            'key', 'room',
            'label', 'Created a room',
            'value', (
              SELECT count(DISTINCT r.user_id)::bigint
              FROM public.rooms AS r
              WHERE r.user_id IN (SELECT id FROM cohort)
            )
          ),
          jsonb_build_object(
            'key', 'items_5',
            'label', 'Placed 5+ items',
            'value', (SELECT count(*)::bigint FROM item_counts WHERE n >= 5)
          ),
          jsonb_build_object(
            'key', 'ai_ok',
            'label', '1 successful AI job in 24h',
            'value', (SELECT count(*)::bigint FROM ai_ok)
          ),
          jsonb_build_object(
            'key', 'activated',
            'label', 'Activated (5+ items + AI in 24h)',
            'value', (
              SELECT count(*)::bigint
              FROM cohort AS c
              WHERE EXISTS (SELECT 1 FROM early_rooms AS i WHERE i.user_id = c.id AND i.n >= 5)
                AND EXISTS (SELECT 1 FROM ai_ok AS a WHERE a.user_id = c.id)
            )
          )
        )
      )
    ),
    'cohorts', (
      WITH signups AS (
        SELECT
          date_trunc('week', p.created_at)::date AS cohort,
          p.id,
          p.created_at
        FROM public.profiles AS p
        WHERE p.created_at >= v_to - interval '12 weeks'
          AND p.created_at < v_to
      ),
      activity AS (
        SELECT r.user_id, r.updated_at AS at
        FROM public.rooms AS r
        UNION ALL
        SELECT cj.user_id, coalesce(cj.completed_at, cj.updated_at, cj.created_at) AS at
        FROM public.conversion_jobs AS cj
        UNION ALL
        SELECT p.id, p.last_active_at AS at
        FROM public.profiles AS p
        WHERE p.last_active_at IS NOT NULL
      )
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'cohort', c.cohort,
            'size', c.size,
            'd1', c.activated_24h,
            'd7', c.w1,
            'd30', c.w4
          )
          ORDER BY c.cohort DESC
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT
          s.cohort,
          count(*)::bigint AS size,
          count(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM public.rooms AS r
              JOIN public.room_items AS ri ON ri.room_id = r.id
              WHERE r.user_id = s.id
            )
            AND (
              SELECT count(*) FROM public.room_items AS ri
              JOIN public.rooms AS r ON r.id = ri.room_id
              WHERE r.user_id = s.id
            ) >= 5
            AND EXISTS (
              SELECT 1 FROM public.conversion_jobs AS cj
              WHERE cj.user_id = s.id
                AND cj.status = 'completed'
                AND coalesce(cj.completed_at, cj.updated_at) < s.created_at + interval '24 hours'
            )
          )::bigint AS activated_24h,
          count(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM activity AS a
              WHERE a.user_id = s.id
                AND a.at >= s.created_at
                AND a.at < s.created_at + interval '7 days'
                AND a.at::date > s.created_at::date
            )
          )::bigint AS w1,
          count(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM activity AS a
              WHERE a.user_id = s.id
                AND a.at >= s.created_at
                AND a.at < s.created_at + interval '28 days'
                AND a.at::date > s.created_at::date
            )
          )::bigint AS w4
        FROM signups AS s
        GROUP BY s.cohort
        ORDER BY s.cohort DESC
        LIMIT 12
      ) AS c
    ),
    'by_first_ai', (
      WITH first_job AS (
        SELECT DISTINCT ON (cj.user_id)
          cj.user_id,
          cj.status,
          cj.created_at
        FROM public.conversion_jobs AS cj
        WHERE cj.created_at >= v_from
          AND cj.created_at < v_to
        ORDER BY cj.user_id, cj.created_at ASC
      ),
      returned AS (
        SELECT fj.user_id
        FROM first_job AS fj
        WHERE EXISTS (
          SELECT 1
          FROM (
            SELECT r.user_id, r.updated_at AS at FROM public.rooms AS r
            UNION ALL
            SELECT cj.user_id, coalesce(cj.completed_at, cj.updated_at, cj.created_at)
            FROM public.conversion_jobs AS cj
          ) AS a
          WHERE a.user_id = fj.user_id
            AND a.at::date > fj.created_at::date
        )
      )
      SELECT jsonb_build_array(
        jsonb_build_object(
          'key', 'completed',
          'label', 'First AI job succeeded',
          'users', (SELECT count(*)::bigint FROM first_job WHERE status = 'completed'),
          'returned', (
            SELECT count(*)::bigint
            FROM first_job AS fj
            WHERE fj.status = 'completed'
              AND EXISTS (SELECT 1 FROM returned AS r WHERE r.user_id = fj.user_id)
          )
        ),
        jsonb_build_object(
          'key', 'failed',
          'label', 'First AI job failed',
          'users', (SELECT count(*)::bigint FROM first_job WHERE status = 'failed'),
          'returned', (
            SELECT count(*)::bigint
            FROM first_job AS fj
            WHERE fj.status = 'failed'
              AND EXISTS (SELECT 1 FROM returned AS r WHERE r.user_id = fj.user_id)
          )
        )
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_retention_relational(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_retention_relational(timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.admin_retention_relational(timestamptz, timestamptz) IS
  'Admin-only relational retention: activation funnel, week-1/week-4 cohorts, return by first AI outcome.';
