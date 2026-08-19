-- Public CDN mirror for catalog + public-room assets.
-- Private originals stay in model-files / room-thumbnails.
-- Public URLs: /storage/v1/object/public/public-models/{path}
--
-- Anyone with the URL can download (intentional). INSERT/DELETE stay owner-folder
-- so unpublished private models cannot be planted or removed by others.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'public-models',
  'public-models',
  true,
  524288000
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 524288000;

-- True when this object path is currently a public catalog, public room, or
-- public room thumbnail asset. Used before deleting the CDN mirror copy.
CREATE OR REPLACE FUNCTION public.is_cdn_public_asset(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p_object_path IS NOT NULL
    AND length(trim(p_object_path)) > 0
    AND p_object_path !~* '^https?://'
    AND p_object_path !~* '^blob:'
    AND (
      public.has_public_catalog_asset(p_object_path)
      OR public.has_public_room_asset(p_object_path)
      OR public.has_public_room_thumbnail(p_object_path)
    );
$$;

REVOKE ALL ON FUNCTION public.is_cdn_public_asset(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_cdn_public_asset(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_cdn_public_asset(text) TO authenticated;

DROP POLICY IF EXISTS public_models_insert ON storage.objects;
DROP POLICY IF EXISTS public_models_select ON storage.objects;
DROP POLICY IF EXISTS public_models_update ON storage.objects;
DROP POLICY IF EXISTS public_models_delete ON storage.objects;

-- Public /object/public URLs bypass RLS. These policies only gate upload/copy/delete.
CREATE POLICY public_models_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'public-models'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

-- Owner SELECT so copy/list of own mirrored objects works.
CREATE POLICY public_models_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'public-models'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

CREATE POLICY public_models_update ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'public-models'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  )
  WITH CHECK (
    bucket_id = 'public-models'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );

CREATE POLICY public_models_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'public-models'
    AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
  );
