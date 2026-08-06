-- Top-down silhouettes for imported catalog models (floor-plan previews).
-- Apply via migration 20260806142600_catalog_topdown_silhouettes.sql

ALTER TABLE public.furniture_catalog
  ADD COLUMN IF NOT EXISTS silhouette_path text;

CREATE OR REPLACE FUNCTION public.has_public_catalog_asset(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.furniture_catalog fc
    WHERE fc.visibility = 'public'
      AND p_object_path IS NOT NULL
      AND length(trim(p_object_path)) > 0
      AND p_object_path !~* '^https?://'
      AND p_object_path !~* '^blob:'
      AND (
        NULLIF(trim(fc.model_url), '') = p_object_path
        OR NULLIF(trim(fc.usdz_path), '') = p_object_path
        OR NULLIF(trim(fc.thumbnail_path), '') = p_object_path
        OR NULLIF(trim(fc.silhouette_path), '') = p_object_path
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_public_catalog_asset(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_public_catalog_asset(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION private.room_preview_items(p_room_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ri.id,
        'kind', ri.kind,
        'pos_x', ri.pos_x,
        'pos_y', ri.pos_y,
        'pos_z', ri.pos_z,
        'rotation_y', ri.rotation_y,
        'size_w', ri.size_w,
        'size_h', ri.size_h,
        'size_d', ri.size_d,
        'model_url', ri.model_url,
        'silhouette_path', fc.silhouette_path
      )
      ORDER BY ri.sort_order
    ),
    '[]'::jsonb
  )
  FROM public.room_items ri
  LEFT JOIN public.furniture_catalog fc
    ON ri.kind = 'imported'
   AND NULLIF(trim(ri.model_url), '') IS NOT NULL
   AND NULLIF(trim(fc.model_url), '') = NULLIF(trim(ri.model_url), '')
  WHERE ri.room_id = p_room_id
    AND ri.kind IN (
      'bed', 'dresser', 'wardrobe', 'desk', 'chair', 'nightstand', 'lamp', 'imported'
    );
$$;

REVOKE ALL ON FUNCTION private.room_preview_items(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_catalog_model(p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  row_model text;
  row_thumb text;
  row_sil text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT model_url, thumbnail_path, silhouette_path
  INTO row_model, row_thumb, row_sil
  FROM public.furniture_catalog
  WHERE kind = p_kind AND user_id = uid AND is_builtin = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.furniture_catalog
  WHERE kind = p_kind AND user_id = uid AND is_builtin = false;

  RETURN jsonb_build_object(
    'model_url', row_model,
    'thumbnail_path', row_thumb,
    'silhouette_path', row_sil
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_catalog_model(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_catalog_model(text) TO authenticated;
