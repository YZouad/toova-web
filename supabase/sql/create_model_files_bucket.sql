-- Private bucket: GLBs live at model-files/{auth.uid()}/{uuid}.glb
-- Store the object path (not a signed URL) in furniture_catalog.model_url and room_items.model_url.
--
-- Dashboard → Storage: you can also create bucket "model-files" (private) and paste policies below.

INSERT INTO storage.buckets (id, name, public)
  VALUES ('model-files', 'model-files', false)
  ON CONFLICT (id) DO NOTHING;

-- Replace policies if re-running (names must be unique per table/command).
DROP POLICY IF EXISTS model_files_insert ON storage.objects;
DROP POLICY IF EXISTS model_files_select ON storage.objects;

CREATE POLICY model_files_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'model-files'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY model_files_select ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'model-files'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
