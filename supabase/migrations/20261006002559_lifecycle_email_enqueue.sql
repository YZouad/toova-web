-- Enqueue lifecycle email candidates + hourly cron to drain the outbox.

CREATE OR REPLACE FUNCTION public.enqueue_lifecycle_candidates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  finish_n int := 0;
  credits_n int := 0;
  movein_n int := 0;
  r record;
  item_count bigint;
BEGIN
  -- Finish your room: signed up 24–48h ago, fewer than 5 items total.
  FOR r IN
    SELECT p.id
    FROM public.profiles AS p
    WHERE p.created_at <= now() - interval '24 hours'
      AND p.created_at > now() - interval '48 hours'
  LOOP
    SELECT count(*) INTO item_count
    FROM public.room_items AS ri
    JOIN public.rooms AS rooms ON rooms.id = ri.room_id
    WHERE rooms.user_id = r.id;

    IF item_count < 5 THEN
      IF public.enqueue_lifecycle_email(
        r.id,
        'finish_room',
        'finish_room:' || r.id::text,
        jsonb_build_object('item_count', item_count)
      ) IS NOT NULL THEN
        finish_n := finish_n + 1;
      END IF;
    END IF;
  END LOOP;

  -- Credits refreshed: monthly period started in the last 25 hours.
  FOR r IN
    SELECT w.user_id, w.monthly_balance, w.monthly_period_end
    FROM public.credit_wallets AS w
    WHERE w.monthly_period_end IS NOT NULL
      AND (w.monthly_period_end - interval '1 month') > now() - interval '25 hours'
      AND (w.monthly_period_end - interval '1 month') <= now()
      AND w.monthly_balance > 0
  LOOP
    IF public.enqueue_lifecycle_email(
      r.user_id,
      'credits_refreshed',
      'credits_refreshed:' || to_char(date_trunc('month', now()), 'YYYY-MM'),
      jsonb_build_object('monthly_balance', r.monthly_balance)
    ) IS NOT NULL THEN
      credits_n := credits_n + 1;
    END IF;
  END LOOP;

  -- Move-in countdown: weekly nudge for rooms with a budget and unresolved checklist rows.
  FOR r IN
    SELECT DISTINCT b.user_id, b.room_id, b.budget_cents
    FROM public.user_move_in_budget AS b
    WHERE coalesce(b.budget_cents, 0) > 0
      AND EXISTS (
        SELECT 1
        FROM public.user_checklist_progress AS p
        WHERE p.user_id = b.user_id
          AND p.room_id IS NOT DISTINCT FROM b.room_id
          AND coalesce(p.resolution, '') NOT IN ('have', 'skip')
      )
  LOOP
    IF public.enqueue_lifecycle_email(
      r.user_id,
      'move_in_countdown',
      'move_in_countdown:' || r.user_id::text || ':' || to_char(now(), 'IYYY-IW'),
      jsonb_build_object('room_id', r.room_id, 'budget_cents', r.budget_cents)
    ) IS NOT NULL THEN
      movein_n := movein_n + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'finish_room', finish_n,
    'credits_refreshed', credits_n,
    'move_in_countdown', movein_n
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_lifecycle_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_lifecycle_candidates() TO service_role;

-- Prefer daily digest keys for social engagement emails (redefine helpers used by triggers).
CREATE OR REPLACE FUNCTION public.notify_on_room_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  room_name text;
BEGIN
  SELECT r.user_id, r.name INTO owner_id, room_name
  FROM public.rooms AS r
  WHERE r.id = NEW.room_id;

  IF owner_id IS NULL OR owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_notification(
    owner_id,
    'room_liked',
    'Someone liked your room',
    coalesce(room_name, 'Your room') || ' got a like.',
    jsonb_build_object('room_id', NEW.room_id, 'from_user_id', NEW.user_id)
  );
  PERFORM public.enqueue_lifecycle_email(
    owner_id,
    'room_liked',
    'likes_digest:' || to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD'),
    jsonb_build_object('room_id', NEW.room_id, 'room_name', room_name)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_room_fork()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  room_name text;
BEGIN
  IF NEW.forked_from IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.user_id, r.name INTO owner_id, room_name
  FROM public.rooms AS r
  WHERE r.id = NEW.forked_from;

  IF owner_id IS NULL OR owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_notification(
    owner_id,
    'room_copied',
    'Someone copied your room',
    coalesce(room_name, 'Your room') || ' was remixed.',
    jsonb_build_object('room_id', NEW.forked_from, 'copy_room_id', NEW.id, 'from_user_id', NEW.user_id)
  );
  PERFORM public.enqueue_lifecycle_email(
    owner_id,
    'room_copied',
    'copies_digest:' || to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD'),
    jsonb_build_object('room_id', NEW.forked_from, 'room_name', room_name)
  );
  RETURN NEW;
END;
$$;

-- Hourly cron jobs (also applied remotely). Drain hits Edge Function send-lifecycle-email.
CREATE OR REPLACE FUNCTION public.invoke_lifecycle_email_drain()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  req_id bigint;
  endpoint text;
  secret text;
BEGIN
  endpoint := nullif(current_setting('app.settings.lifecycle_email_url', true), '');
  secret := nullif(current_setting('app.settings.lifecycle_cron_secret', true), '');
  IF endpoint IS NULL THEN
    endpoint := 'https://xfifgtedssabneqlxbhf.supabase.co/functions/v1/send-lifecycle-email';
  END IF;
  IF secret IS NULL THEN
    secret := '';
  END IF;

  SELECT net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', secret
    ),
    body := '{}'::jsonb
  ) INTO req_id;

  RETURN req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_lifecycle_email_drain() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_lifecycle_email_drain() TO service_role;
