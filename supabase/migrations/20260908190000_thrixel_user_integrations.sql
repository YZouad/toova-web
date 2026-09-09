-- Per-user Thrixel API keys (BYOK). Keys are stored server-side only;
-- the web client reads connection status via RPC, never the key itself.

CREATE TABLE IF NOT EXISTS public.user_integrations (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  thrixel_api_key text NOT NULL,
  thrixel_connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_integrations IS
  'Third-party integration credentials. No client policies — access via service role (BFF) only.';

CREATE OR REPLACE FUNCTION public.get_thrixel_connection_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connected_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;

  SELECT ui.thrixel_connected_at
  INTO v_connected_at
  FROM public.user_integrations AS ui
  WHERE ui.user_id = auth.uid();

  IF v_connected_at IS NULL THEN
    RETURN jsonb_build_object('connected', false);
  END IF;

  RETURN jsonb_build_object(
    'connected', true,
    'connected_at', v_connected_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_thrixel_connection_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_thrixel_connection_status() TO authenticated;

-- Allow thrixel as a conversion_jobs source.
ALTER TABLE public.conversion_jobs
  DROP CONSTRAINT IF EXISTS conversion_jobs_source_check;

ALTER TABLE public.conversion_jobs
  ADD CONSTRAINT conversion_jobs_source_check
  CHECK (source IN ('trellis', 'thrixel', 'upload', 'poster'));
