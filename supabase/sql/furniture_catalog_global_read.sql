-- Allow any authenticated user to read all furniture_catalog rows and all objects
-- in the model-files bucket, so custom uploads are visible and loadable for everyone.
-- Upload paths remain under {auth.uid()}/... (see create_model_files_bucket.sql insert policy).
--
-- Run in Supabase → SQL Editor after add_furniture_catalog_description.sql and
-- create_model_files_bucket.sql.

BEGIN;

DROP POLICY IF EXISTS catalog_select ON public.furniture_catalog;

CREATE POLICY catalog_select ON public.furniture_catalog
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS model_files_select ON storage.objects;

CREATE POLICY model_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'model-files');

COMMIT;
