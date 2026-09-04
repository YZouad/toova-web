-- Universal content reports, quarantine, preservation, and admin review RPCs.
-- Replaces the catalog-only report path as the primary write surface (Edge Function
-- inserts via service role). report_catalog_model remains as a forwarding shim.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Quarantine columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.furniture_catalog
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz,
  ADD COLUMN IF NOT EXISTS quarantine_reason text;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz,
  ADD COLUMN IF NOT EXISTS quarantine_reason text;

CREATE INDEX IF NOT EXISTS idx_furniture_catalog_quarantined
  ON public.furniture_catalog (quarantined_at)
  WHERE quarantined_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_quarantined
  ON public.rooms (quarantined_at)
  WHERE quarantined_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) content_reports + report_actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  reporter_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reporter_email text,
  target_type text NOT NULL,
  target_id text NOT NULL,
  target_owner_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'new',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolution_note text,
  ncmec_report_id text,
  ncmec_reported_at timestamptz,
  preserve_until timestamptz,
  CONSTRAINT content_reports_target_type_check CHECK (
    target_type = ANY (ARRAY[
      'catalog_model'::text,
      'room'::text,
      'profile'::text,
      'avatar'::text,
      'share'::text,
      'other'::text
    ])
  ),
  CONSTRAINT content_reports_reason_check CHECK (
    reason = ANY (ARRAY[
      'csam'::text,
      'sexual_content'::text,
      'harassment'::text,
      'inappropriate'::text,
      'spam'::text,
      'stolen'::text,
      'other'::text
    ])
  ),
  CONSTRAINT content_reports_status_check CHECK (
    status = ANY (ARRAY[
      'new'::text,
      'reviewing'::text,
      'actioned'::text,
      'dismissed'::text,
      'escalated_ncmec'::text
    ])
  ),
  CONSTRAINT content_reports_details_len CHECK (
    details IS NULL OR char_length(details) <= 2000
  ),
  CONSTRAINT content_reports_reporter_email_len CHECK (
    reporter_email IS NULL OR char_length(reporter_email) <= 320
  ),
  CONSTRAINT content_reports_resolution_note_len CHECK (
    resolution_note IS NULL OR char_length(resolution_note) <= 2000
  )
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status_created
  ON public.content_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_reports_reason_created
  ON public.content_reports (reason, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_reports_target
  ON public.content_reports (target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_content_reports_owner
  ON public.content_reports (target_owner_id, created_at DESC)
  WHERE target_owner_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.report_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  report_id uuid NOT NULL REFERENCES public.content_reports (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT report_actions_action_check CHECK (
    action = ANY (ARRAY[
      'created'::text,
      'reviewing'::text,
      'quarantine'::text,
      'restore'::text,
      'dismiss'::text,
      'action'::text,
      'ban_uploader'::text,
      'escalate_ncmec'::text
    ])
  ),
  CONSTRAINT report_actions_note_len CHECK (
    note IS NULL OR char_length(note) <= 2000
  )
);

CREATE INDEX IF NOT EXISTS idx_report_actions_report
  ON public.report_actions (report_id, created_at DESC);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_reports_no_direct ON public.content_reports;
CREATE POLICY content_reports_no_direct ON public.content_reports
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS report_actions_no_direct ON public.report_actions;
CREATE POLICY report_actions_no_direct ON public.report_actions
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- 3) Quarantine helpers (service role / SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quarantine_catalog_model(
  p_kind text,
  p_reason text DEFAULT 'report'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.furniture_catalog
  SET
    quarantined_at = coalesce(quarantined_at, now()),
    quarantine_reason = coalesce(p_reason, 'report'),
    visibility = CASE
      WHEN visibility = 'public' THEN 'private'
      ELSE visibility
    END
  WHERE kind = p_kind
    AND is_builtin = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.quarantine_room(
  p_room_id uuid,
  p_reason text DEFAULT 'report'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('app.toova_bypass_room_guards', '1', true);
  UPDATE public.rooms
  SET
    quarantined_at = coalesce(quarantined_at, now()),
    quarantine_reason = coalesce(p_reason, 'report'),
    visibility = CASE
      WHEN visibility = 'public' THEN 'private'
      ELSE visibility
    END
  WHERE id = p_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_catalog_model(p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.furniture_catalog
  SET quarantined_at = NULL, quarantine_reason = NULL
  WHERE kind = p_kind;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_room(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.toova_bypass_room_guards', '1', true);
  UPDATE public.rooms
  SET quarantined_at = NULL, quarantine_reason = NULL
  WHERE id = p_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.quarantine_catalog_model(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quarantine_room(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_catalog_model(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quarantine_catalog_model(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.quarantine_room(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_catalog_model(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_room(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Preservation: block hard-delete while preserve_until is in the future
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_block_preserved_catalog_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.content_reports cr
    WHERE cr.target_type = 'catalog_model'
      AND cr.target_id = OLD.kind
      AND cr.preserve_until IS NOT NULL
      AND cr.preserve_until > now()
  ) THEN
    RAISE EXCEPTION 'content under preservation cannot be deleted'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_preserved_catalog_delete ON public.furniture_catalog;
CREATE TRIGGER trg_block_preserved_catalog_delete
  BEFORE DELETE ON public.furniture_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_preserved_catalog_delete();

CREATE OR REPLACE FUNCTION public.trg_block_preserved_room_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.content_reports cr
    WHERE cr.target_type = 'room'
      AND cr.target_id = OLD.id::text
      AND cr.preserve_until IS NOT NULL
      AND cr.preserve_until > now()
  ) THEN
    RAISE EXCEPTION 'content under preservation cannot be deleted'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_preserved_room_delete ON public.rooms;
CREATE TRIGGER trg_block_preserved_room_delete
  BEFORE DELETE ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_preserved_room_delete();

-- Block owners from re-publishing quarantined content
CREATE OR REPLACE FUNCTION public.trg_block_quarantined_catalog_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.visibility = 'public'
     AND NEW.quarantined_at IS NOT NULL
     AND (OLD.visibility IS DISTINCT FROM 'public' OR OLD.quarantined_at IS DISTINCT FROM NEW.quarantined_at)
  THEN
    RAISE EXCEPTION 'quarantined content cannot be made public'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_quarantined_catalog_public ON public.furniture_catalog;
CREATE TRIGGER trg_block_quarantined_catalog_public
  BEFORE UPDATE OF visibility, quarantined_at ON public.furniture_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_quarantined_catalog_public();

CREATE OR REPLACE FUNCTION public.trg_block_quarantined_room_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.visibility = 'public'
     AND NEW.quarantined_at IS NOT NULL
     AND (OLD.visibility IS DISTINCT FROM 'public' OR OLD.quarantined_at IS DISTINCT FROM NEW.quarantined_at)
  THEN
    RAISE EXCEPTION 'quarantined content cannot be made public'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_quarantined_room_public ON public.rooms;
CREATE TRIGGER trg_block_quarantined_room_public
  BEFORE UPDATE OF visibility, quarantined_at ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_quarantined_room_public();

-- ---------------------------------------------------------------------------
-- 5) Admin RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_content_reports(
  p_status text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  rows jsonb;
  total bigint;
BEGIN
  IF uid IS NULL OR NOT public.is_admin(uid) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO total
  FROM public.content_reports cr
  WHERE (p_status IS NULL OR cr.status = p_status)
    AND (p_reason IS NULL OR cr.reason = p_reason);

  SELECT coalesce(jsonb_agg(row_data ORDER BY sort_priority, created_at DESC), '[]'::jsonb)
  INTO rows
  FROM (
    SELECT
      jsonb_build_object(
        'id', cr.id,
        'created_at', cr.created_at,
        'reporter_id', cr.reporter_id,
        'reporter_email', cr.reporter_email,
        'target_type', cr.target_type,
        'target_id', cr.target_id,
        'target_owner_id', cr.target_owner_id,
        'reason', cr.reason,
        'details', cr.details,
        'status', cr.status,
        'evidence', cr.evidence,
        'reviewed_by', cr.reviewed_by,
        'reviewed_at', cr.reviewed_at,
        'resolution_note', cr.resolution_note,
        'ncmec_report_id', cr.ncmec_report_id,
        'ncmec_reported_at', cr.ncmec_reported_at,
        'preserve_until', cr.preserve_until
      ) AS row_data,
      CASE WHEN cr.reason IN ('csam', 'sexual_content') THEN 0 ELSE 1 END AS sort_priority,
      cr.created_at
    FROM public.content_reports cr
    WHERE (p_status IS NULL OR cr.status = p_status)
      AND (p_reason IS NULL OR cr.reason = p_reason)
    ORDER BY sort_priority, cr.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
    OFFSET greatest(0, coalesce(p_offset, 0))
  ) sub;

  RETURN jsonb_build_object('total', total, 'reports', rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_content_report_action(
  p_report_id uuid,
  p_action text,
  p_note text DEFAULT NULL,
  p_ncmec_report_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  rep public.content_reports%ROWTYPE;
  new_status text;
  k text;
  rid uuid;
BEGIN
  IF uid IS NULL OR NOT public.is_admin(uid) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_action IS NULL OR p_action NOT IN (
    'reviewing', 'quarantine', 'restore', 'dismiss', 'action', 'ban_uploader', 'escalate_ncmec'
  ) THEN
    RAISE EXCEPTION 'invalid action' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO rep FROM public.content_reports WHERE id = p_report_id;
  IF rep.id IS NULL THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'escalate_ncmec' THEN
    IF p_ncmec_report_id IS NULL OR length(trim(p_ncmec_report_id)) < 3 THEN
      RAISE EXCEPTION 'ncmec_report_id required' USING ERRCODE = '22023';
    END IF;
  END IF;

  new_status := CASE p_action
    WHEN 'reviewing' THEN 'reviewing'
    WHEN 'dismiss' THEN 'dismissed'
    WHEN 'action' THEN 'actioned'
    WHEN 'ban_uploader' THEN 'actioned'
    WHEN 'escalate_ncmec' THEN 'escalated_ncmec'
    ELSE rep.status
  END;

  IF p_action = 'quarantine' THEN
    IF rep.target_type = 'catalog_model' THEN
      PERFORM public.quarantine_catalog_model(rep.target_id, 'admin_action');
    ELSIF rep.target_type = 'room' THEN
      PERFORM public.quarantine_room(rep.target_id::uuid, 'admin_action');
    END IF;
    new_status := 'actioned';
  ELSIF p_action = 'restore' THEN
    IF rep.target_type = 'catalog_model' THEN
      PERFORM public.restore_catalog_model(rep.target_id);
    ELSIF rep.target_type = 'room' THEN
      PERFORM public.restore_room(rep.target_id::uuid);
    END IF;
  ELSIF p_action = 'ban_uploader' AND rep.target_owner_id IS NOT NULL THEN
    -- Soft-ban: force profile private and quarantine owned public catalog/rooms.
    UPDATE public.profiles
    SET is_public = false, updated_at = now()
    WHERE id = rep.target_owner_id;

    FOR k IN
      SELECT fc.kind FROM public.furniture_catalog fc
      WHERE fc.user_id = rep.target_owner_id AND fc.visibility = 'public'
    LOOP
      PERFORM public.quarantine_catalog_model(k, 'uploader_ban');
    END LOOP;

    FOR rid IN
      SELECT r.id FROM public.rooms r
      WHERE r.user_id = rep.target_owner_id AND r.visibility = 'public'
    LOOP
      PERFORM public.quarantine_room(rid, 'uploader_ban');
    END LOOP;
  END IF;

  UPDATE public.content_reports
  SET
    status = new_status,
    reviewed_by = uid,
    reviewed_at = now(),
    resolution_note = CASE
      WHEN p_note IS NOT NULL THEN nullif(trim(p_note), '')
      ELSE resolution_note
    END,
    ncmec_report_id = CASE
      WHEN p_action = 'escalate_ncmec' THEN trim(p_ncmec_report_id)
      ELSE ncmec_report_id
    END,
    ncmec_reported_at = CASE
      WHEN p_action = 'escalate_ncmec' THEN now()
      ELSE ncmec_reported_at
    END,
    preserve_until = CASE
      WHEN p_action = 'escalate_ncmec' THEN now() + interval '90 days'
      ELSE preserve_until
    END
  WHERE id = p_report_id
  RETURNING * INTO rep;

  INSERT INTO public.report_actions (report_id, actor_id, action, note, metadata)
  VALUES (
    p_report_id,
    uid,
    p_action,
    nullif(trim(coalesce(p_note, '')), ''),
    CASE
      WHEN p_action = 'escalate_ncmec' THEN jsonb_build_object('ncmec_report_id', trim(p_ncmec_report_id))
      ELSE '{}'::jsonb
    END
  );

  RETURN to_jsonb(rep);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unreviewed_report_count()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  n int;
BEGIN
  IF uid IS NULL OR NOT public.is_admin(uid) THEN
    RETURN 0;
  END IF;
  SELECT count(*)::int INTO n
  FROM public.content_reports
  WHERE status IN ('new', 'reviewing');
  RETURN coalesce(n, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_content_reports(text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_content_report_action(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_unreviewed_report_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_content_reports(text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_content_report_action(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unreviewed_report_count() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Backfill catalog_reports → content_reports
-- ---------------------------------------------------------------------------
INSERT INTO public.content_reports (
  id,
  created_at,
  reporter_id,
  target_type,
  target_id,
  target_owner_id,
  reason,
  details,
  status,
  evidence
)
SELECT
  cr.id,
  cr.created_at,
  cr.reporter_id,
  'catalog_model',
  cr.model_kind,
  fc.user_id,
  CASE
    WHEN cr.reason IN ('inappropriate', 'spam', 'stolen', 'other') THEN cr.reason
    ELSE 'other'
  END,
  cr.details,
  'new',
  jsonb_build_object(
    'source', 'catalog_reports_backfill',
    'model_kind', cr.model_kind,
    'label', fc.label,
    'visibility', fc.visibility,
    'thumbnail_path', fc.thumbnail_path,
    'model_url', fc.model_url
  )
FROM public.catalog_reports cr
LEFT JOIN public.furniture_catalog fc ON fc.kind = cr.model_kind
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7) Shim: report_catalog_model → content_reports (legacy callers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_catalog_model(
  p_kind text,
  p_reason text,
  p_details text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  new_id uuid;
  recent int;
  target record;
  mapped_reason text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  mapped_reason := CASE
    WHEN p_reason IN ('inappropriate', 'spam', 'stolen', 'other', 'csam', 'sexual_content', 'harassment')
      THEN p_reason
    ELSE NULL
  END;

  IF mapped_reason IS NULL THEN
    RAISE EXCEPTION 'invalid reason' USING ERRCODE = '22023';
  END IF;

  IF p_details IS NOT NULL AND char_length(trim(p_details)) > 500 THEN
    RAISE EXCEPTION 'invalid details' USING ERRCODE = '22023';
  END IF;

  SELECT fc.kind, fc.user_id, fc.is_builtin, fc.visibility,
         fc.label, fc.thumbnail_path, fc.model_url, fc.quarantined_at
  INTO target
  FROM public.furniture_catalog fc
  WHERE fc.kind = p_kind;

  IF target.kind IS NULL THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;

  IF target.is_builtin OR target.visibility <> 'public' THEN
    RAISE EXCEPTION 'not reportable' USING ERRCODE = '22023';
  END IF;

  IF target.user_id = uid THEN
    RAISE EXCEPTION 'cannot report own model' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::int INTO recent
  FROM public.content_reports r
  WHERE r.reporter_id = uid
    AND r.created_at > now() - interval '1 hour';

  IF recent >= 10 THEN
    RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.content_reports (
    reporter_id, target_type, target_id, target_owner_id,
    reason, details, evidence
  )
  VALUES (
    uid,
    'catalog_model',
    p_kind,
    target.user_id,
    mapped_reason,
    nullif(trim(coalesce(p_details, '')), ''),
    jsonb_build_object(
      'source', 'report_catalog_model_shim',
      'model_kind', p_kind,
      'label', target.label,
      'visibility', target.visibility,
      'thumbnail_path', target.thumbnail_path,
      'model_url', target.model_url
    )
  )
  RETURNING id INTO new_id;

  INSERT INTO public.report_actions (report_id, actor_id, action, note)
  VALUES (new_id, uid, 'created', 'via report_catalog_model shim');

  IF mapped_reason IN ('csam', 'sexual_content') THEN
    PERFORM public.quarantine_catalog_model(p_kind, mapped_reason);
  END IF;

  -- Keep legacy table in sync for any SQL reviews still looking there.
  INSERT INTO public.catalog_reports (reporter_id, model_kind, reason, details)
  VALUES (
    uid,
    p_kind,
    CASE WHEN mapped_reason IN ('inappropriate', 'spam', 'stolen', 'other')
      THEN mapped_reason ELSE 'other' END,
    nullif(trim(coalesce(p_details, '')), '')
  )
  ON CONFLICT (reporter_id, model_kind) DO UPDATE
    SET reason = EXCLUDED.reason,
        details = EXCLUDED.details,
        created_at = now();

  RETURN new_id;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
