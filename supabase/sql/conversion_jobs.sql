-- Persist image→3D / import pipeline status for the admin Jobs tab.
-- Prefer applying via migrations; this file mirrors the migration for SQL Editor use.

CREATE TABLE IF NOT EXISTS public.conversion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text,
  label text,
  source text NOT NULL
    CHECK (source IN ('trellis', 'upload', 'poster')),
  status text NOT NULL
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS conversion_jobs_created_at_idx
  ON public.conversion_jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS conversion_jobs_status_idx
  ON public.conversion_jobs (status);

CREATE INDEX IF NOT EXISTS conversion_jobs_user_id_idx
  ON public.conversion_jobs (user_id);

ALTER TABLE public.conversion_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversion_jobs_select_own_or_admin ON public.conversion_jobs;
CREATE POLICY conversion_jobs_select_own_or_admin ON public.conversion_jobs
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS conversion_jobs_insert_own ON public.conversion_jobs;
CREATE POLICY conversion_jobs_insert_own ON public.conversion_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS conversion_jobs_update_own ON public.conversion_jobs;
CREATE POLICY conversion_jobs_update_own ON public.conversion_jobs
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE ON TABLE public.conversion_jobs TO authenticated;

INSERT INTO public.conversion_jobs (
  user_id,
  kind,
  label,
  source,
  status,
  created_at,
  updated_at,
  completed_at
)
SELECT
  fc.user_id,
  fc.kind,
  fc.label,
  CASE
    WHEN fc.tags @> ARRAY['poster']::text[] THEN 'poster'
    ELSE 'upload'
  END,
  'completed',
  COALESCE(fc.created_at, now()),
  COALESCE(fc.created_at, now()),
  COALESCE(fc.created_at, now())
FROM public.furniture_catalog AS fc
WHERE fc.is_builtin = false
  AND fc.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.conversion_jobs AS cj
    WHERE cj.kind = fc.kind
  );

DROP FUNCTION IF EXISTS public.get_admin_conversion_jobs(integer);

CREATE OR REPLACE FUNCTION public.get_admin_conversion_jobs(p_hours int DEFAULT 24)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  handle text,
  display_name text,
  kind text,
  label text,
  source text,
  status text,
  error text,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lookback interval;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admins AS a
    WHERE a.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  lookback := make_interval(hours => GREATEST(COALESCE(p_hours, 24), 1));

  RETURN QUERY
  SELECT
    j.id,
    j.user_id,
    p.handle,
    p.display_name,
    j.kind,
    j.label,
    j.source,
    j.status,
    j.error,
    j.created_at,
    j.updated_at,
    j.completed_at
  FROM public.conversion_jobs AS j
  LEFT JOIN public.profiles AS p ON p.id = j.user_id
  WHERE j.created_at >= now() - lookback
  ORDER BY j.created_at DESC
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_conversion_jobs(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_conversion_jobs(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_conversion_jobs(integer) TO authenticated;

COMMENT ON TABLE public.conversion_jobs IS
  'Image→3D / import pipeline jobs for admin monitoring.';
COMMENT ON FUNCTION public.get_admin_conversion_jobs(integer) IS
  'Admin-only: recent conversion jobs with owner profile fields.';
