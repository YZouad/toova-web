-- User reports for public community catalog models.
-- Mirror of migrations/20260805155800_catalog_reports.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.catalog_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  reporter_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  model_kind text NOT NULL REFERENCES public.furniture_catalog (kind) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  CONSTRAINT catalog_reports_reason_check CHECK (
    reason = ANY (ARRAY['inappropriate'::text, 'spam'::text, 'stolen'::text, 'other'::text])
  ),
  CONSTRAINT catalog_reports_details_len CHECK (
    details IS NULL OR char_length(details) <= 500
  ),
  CONSTRAINT catalog_reports_unique_reporter UNIQUE (reporter_id, model_kind)
);

CREATE INDEX IF NOT EXISTS idx_catalog_reports_kind_created
  ON public.catalog_reports (model_kind, created_at DESC);

ALTER TABLE public.catalog_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_reports_no_direct ON public.catalog_reports;
CREATE POLICY catalog_reports_no_direct ON public.catalog_reports
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

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
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR p_reason NOT IN ('inappropriate', 'spam', 'stolen', 'other') THEN
    RAISE EXCEPTION 'invalid reason' USING ERRCODE = '22023';
  END IF;

  IF p_details IS NOT NULL AND char_length(trim(p_details)) > 500 THEN
    RAISE EXCEPTION 'invalid details' USING ERRCODE = '22023';
  END IF;

  SELECT fc.kind, fc.user_id, fc.is_builtin, fc.visibility
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
  FROM public.catalog_reports r
  WHERE r.reporter_id = uid
    AND r.created_at > now() - interval '1 hour';

  IF recent >= 10 THEN
    RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.catalog_reports (reporter_id, model_kind, reason, details)
  VALUES (
    uid,
    p_kind,
    p_reason,
    nullif(trim(coalesce(p_details, '')), '')
  )
  ON CONFLICT (reporter_id, model_kind) DO UPDATE
    SET reason = EXCLUDED.reason,
        details = EXCLUDED.details,
        created_at = now()
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.report_catalog_model(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_catalog_model(text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
