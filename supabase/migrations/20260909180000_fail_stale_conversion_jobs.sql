-- Let admins close out abandoned Image→3D jobs that stay "processing"
-- after the browser tab is closed.

DROP POLICY IF EXISTS conversion_jobs_update_admin ON public.conversion_jobs;
CREATE POLICY conversion_jobs_update_admin ON public.conversion_jobs
  FOR UPDATE
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.fail_stale_conversion_jobs(p_minutes int DEFAULT 20)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.conversion_jobs
  SET
    status = 'failed',
    error = 'Interrupted — closed before generation finished.',
    updated_at = now(),
    completed_at = now()
  WHERE status = 'processing'
    AND updated_at < now() - make_interval(mins => GREATEST(COALESCE(p_minutes, 20), 1));

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_stale_conversion_jobs(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_stale_conversion_jobs(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.fail_stale_conversion_jobs(integer) TO authenticated;

COMMENT ON FUNCTION public.fail_stale_conversion_jobs(integer) IS
  'Admin-only: mark conversion jobs stuck in processing as failed.';
