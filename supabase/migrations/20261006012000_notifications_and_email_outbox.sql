-- In-app notifications + email preference / outbox foundation.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_kind_check CHECK (
    kind IN (
      'room_liked',
      'room_copied',
      'model_ready',
      'credits_refreshed',
      'finish_room',
      'move_in_countdown',
      'system'
    )
  )
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id)
  WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email_likes boolean NOT NULL DEFAULT true,
  email_copies boolean NOT NULL DEFAULT true,
  email_model_ready boolean NOT NULL DEFAULT true,
  email_finish_room boolean NOT NULL DEFAULT true,
  email_credits boolean NOT NULL DEFAULT true,
  email_move_in boolean NOT NULL DEFAULT true,
  email_unsubscribed_all boolean NOT NULL DEFAULT false,
  unsubscribe_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_prefs_unsub_token_idx
  ON public.notification_prefs (unsubscribe_token);

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  template text NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS email_outbox_pending_idx
  ON public.email_outbox (created_at ASC)
  WHERE status = 'pending';

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notification_prefs_select_own ON public.notification_prefs;
CREATE POLICY notification_prefs_select_own ON public.notification_prefs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notification_prefs_upsert_own ON public.notification_prefs;
CREATE POLICY notification_prefs_upsert_own ON public.notification_prefs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- email_outbox: no client access (service role only)
DROP POLICY IF EXISTS email_outbox_no_client ON public.email_outbox;
CREATE POLICY email_outbox_no_client ON public.email_outbox
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_prefs TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_notification_prefs(p_uid uuid)
RETURNS public.notification_prefs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.notification_prefs;
BEGIN
  INSERT INTO public.notification_prefs (user_id)
  VALUES (p_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO row FROM public.notification_prefs WHERE user_id = p_uid;
  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nid uuid;
BEGIN
  IF p_user_id IS NULL OR p_kind IS NULL OR p_title IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.notifications (user_id, kind, title, body, payload)
  VALUES (p_user_id, p_kind, p_title, p_body, coalesce(p_payload, '{}'::jsonb))
  RETURNING id INTO nid;
  RETURN nid;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_lifecycle_email(
  p_user_id uuid,
  p_template text,
  p_idempotency_key text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eid uuid;
  prefs public.notification_prefs;
  is_minor boolean;
BEGIN
  prefs := public.ensure_notification_prefs(p_user_id);
  IF prefs.email_unsubscribed_all THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(ua.is_minor, false) INTO is_minor
  FROM public.user_agreements AS ua
  WHERE ua.user_id = p_user_id
  ORDER BY ua.terms_accepted_at DESC NULLS LAST
  LIMIT 1;

  -- Minors: transactional model_ready only.
  IF coalesce(is_minor, false) AND p_template <> 'model_ready' THEN
    RETURN NULL;
  END IF;

  IF p_template = 'room_liked' AND NOT prefs.email_likes THEN RETURN NULL; END IF;
  IF p_template = 'room_copied' AND NOT prefs.email_copies THEN RETURN NULL; END IF;
  IF p_template = 'model_ready' AND NOT prefs.email_model_ready THEN RETURN NULL; END IF;
  IF p_template = 'finish_room' AND NOT prefs.email_finish_room THEN RETURN NULL; END IF;
  IF p_template = 'credits_refreshed' AND NOT prefs.email_credits THEN RETURN NULL; END IF;
  IF p_template = 'move_in_countdown' AND NOT prefs.email_move_in THEN RETURN NULL; END IF;

  INSERT INTO public.email_outbox (user_id, template, idempotency_key, payload)
  VALUES (p_user_id, p_template, p_idempotency_key, coalesce(p_payload, '{}'::jsonb))
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING id INTO eid;
  RETURN eid;
END;
$$;

-- Trigger: room liked
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
    'room_liked:' || NEW.room_id::text || ':' || NEW.user_id::text,
    jsonb_build_object('room_id', NEW.room_id, 'room_name', room_name)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_room_like ON public.room_likes;
CREATE TRIGGER trg_notify_on_room_like
  AFTER INSERT ON public.room_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_room_like();

-- Trigger: room copied (fork)
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
    'room_copied:' || NEW.forked_from::text || ':' || NEW.id::text,
    jsonb_build_object('room_id', NEW.forked_from, 'room_name', room_name)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_room_fork ON public.rooms;
CREATE TRIGGER trg_notify_on_room_fork
  AFTER INSERT ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_room_fork();

-- Trigger: model ready
CREATE OR REPLACE FUNCTION public.notify_on_conversion_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (OLD.status IS DISTINCT FROM 'completed')
     AND NEW.server_owned IS TRUE THEN
    PERFORM public.create_notification(
      NEW.user_id,
      'model_ready',
      'Your model is ready',
      coalesce(NEW.label, 'Your 3D model') || ' finished generating.',
      jsonb_build_object('job_id', NEW.id, 'result_path', NEW.result_path)
    );
    PERFORM public.enqueue_lifecycle_email(
      NEW.user_id,
      'model_ready',
      'model_ready:' || NEW.id::text,
      jsonb_build_object('job_id', NEW.id, 'label', NEW.label)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_conversion_completed ON public.conversion_jobs;
CREATE TRIGGER trg_notify_on_conversion_completed
  AFTER UPDATE OF status ON public.conversion_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_conversion_completed();

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit int DEFAULT 30)
RETURNS SETOF public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT n.*
  FROM public.notifications AS n
  WHERE n.user_id = auth.uid()
  ORDER BY n.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 100));
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  UPDATE public.notifications
  SET read_at = now()
  WHERE user_id = auth.uid()
    AND read_at IS NULL
    AND (p_ids IS NULL OR id = ANY (p_ids));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.unsubscribe_lifecycle_email(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notification_prefs
  SET email_unsubscribed_all = true, updated_at = now()
  WHERE unsubscribe_token = p_token;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_notification_prefs(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_notification(uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_lifecycle_email(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_notifications(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unsubscribe_lifecycle_email(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ensure_notification_prefs(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_lifecycle_email(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_lifecycle_email(text) TO anon, authenticated, service_role;
