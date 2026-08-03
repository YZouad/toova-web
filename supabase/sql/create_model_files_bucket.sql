-- Private bucket: GLBs live at model-files/{auth.uid()}/{uuid}.glb
-- Store the object path (not a signed URL) in furniture_catalog.model_url and room_items.model_url.
--
-- Access model (see security_hardening_public_catalog_and_shares.sql):
--   - Owner: SELECT/UPDATE/DELETE under their folder
--   - Public catalog assets (visibility=public): SELECT for anon+authenticated
--   - Public room assets: SELECT for anon+authenticated
--   - Share links: NOT via storage RLS — use sign-share-assets edge + list_share_asset_paths
--
-- Dashboard → Storage: you can also create bucket "model-files" (private) and paste policies below.

INSERT INTO storage.buckets (id, name, public)
  VALUES ('model-files', 'model-files', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS model_files_insert ON storage.objects;
DROP POLICY IF EXISTS model_files_select ON storage.objects;
DROP POLICY IF EXISTS model_files_select_owner ON storage.objects;
DROP POLICY IF EXISTS model_files_select_public_catalog ON storage.objects;
DROP POLICY IF EXISTS model_files_select_public_room ON storage.objects;
DROP POLICY IF EXISTS model_files_update ON storage.objects;
DROP POLICY IF EXISTS model_files_delete ON storage.objects;

CREATE POLICY model_files_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'model-files'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY model_files_select_owner ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'model-files'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

-- Requires public.has_public_catalog_asset / has_public_room_asset (deployed in hardening SQL).
CREATE POLICY model_files_select_public_catalog ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'model-files'
    AND public.has_public_catalog_asset(name)
  );

CREATE POLICY model_files_select_public_room ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'model-files'
    AND public.has_public_room_asset(name)
  );

CREATE POLICY model_files_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'model-files'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  )
  WITH CHECK (
    bucket_id = 'model-files'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

CREATE POLICY model_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'model-files'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );
