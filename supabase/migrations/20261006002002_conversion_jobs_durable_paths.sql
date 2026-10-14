-- Durable Trellis jobs: server-owned generation with storage paths.
ALTER TABLE public.conversion_jobs
  ADD COLUMN IF NOT EXISTS source_path text,
  ADD COLUMN IF NOT EXISTS result_path text,
  ADD COLUMN IF NOT EXISTS server_owned boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.conversion_jobs.source_path IS
  'model-files object path for the source image (durable Trellis jobs).';
COMMENT ON COLUMN public.conversion_jobs.result_path IS
  'model-files object path for the generated GLB (durable Trellis jobs).';
COMMENT ON COLUMN public.conversion_jobs.server_owned IS
  'True when the BFF owns polling/generation so the job survives tab close.';
