-- Admin-only: set furniture_catalog.thumbnail_path after regenerating a preview.
-- Path guard normally ties keys to the row owner; admins may upload under their
-- own folder, so the guard allows authenticated admins through.

CREATE OR REPLACE FUNCTION public.furniture_catalog_guard_asset_paths()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin((SELECT auth.uid())) THEN
    RETURN NEW;
  END IF;
  IF NOT public.catalog_column_path_ok(NEW.model_url, NEW.user_id)
     OR NOT public.catalog_column_path_ok(NEW.thumbnail_path, NEW.user_id)
     OR NOT public.catalog_column_path_ok(NEW.usdz_path, NEW.user_id)
     OR NOT public.catalog_column_path_ok(NEW.silhouette_path, NEW.user_id) THEN
    RAISE EXCEPTION 'invalid storage path'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_catalog_thumbnail(
  p_kind text,
  p_thumbnail_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  path text := NULLIF(trim(p_thumbnail_path), '');
BEGIN
  IF uid IS NULL OR NOT public.is_admin(uid) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR trim(p_kind) = '' THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;
  IF path IS NULL THEN
    RAISE EXCEPTION 'invalid thumbnail path' USING ERRCODE = '22023';
  END IF;
  IF char_length(path) > 1024
     OR path ~ '[[:cntrl:]\\]'
     OR position('://' IN path) > 0
     OR position('..' IN path) > 0 THEN
    RAISE EXCEPTION 'invalid thumbnail path' USING ERRCODE = '22023';
  END IF;

  UPDATE public.furniture_catalog
  SET thumbnail_path = path
  WHERE kind = trim(p_kind);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_catalog_thumbnail(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_catalog_thumbnail(text, text) TO authenticated;
