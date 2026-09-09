-- Owner-only Thrixel submission metadata for catalog models (BYOK revisions).
-- Kept off furniture_catalog so public gallery SELECT never leaks submission ids.

CREATE TABLE IF NOT EXISTS public.catalog_thrixel_assets (
  kind text PRIMARY KEY REFERENCES public.furniture_catalog (kind) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  submission_id text NOT NULL,
  stage text NOT NULL CHECK (
    stage IN ('architect', 'edit', 'autofix', 'detailed', 'retextured', 'reduced')
  ),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_thrixel_assets_user
  ON public.catalog_thrixel_assets (user_id);

ALTER TABLE public.catalog_thrixel_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_thrixel_assets_owner ON public.catalog_thrixel_assets
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_thrixel_assets TO authenticated;

COMMENT ON TABLE public.catalog_thrixel_assets IS
  'Per-owner Thrixel submission ids for catalog models. Required for in-app revisions.';

ALTER TABLE public.conversion_jobs
  ADD COLUMN IF NOT EXISTS thrixel_submission_id text;

-- Replace a catalog model GLB in place and remap placed room_items for the owner.
CREATE OR REPLACE FUNCTION public.replace_catalog_model_glb(
  p_kind text,
  p_model_url text,
  p_thumbnail_path text,
  p_width_in numeric,
  p_height_in numeric,
  p_depth_in numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  old_model_url text;
  updated_rooms int := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT fc.model_url
  INTO old_model_url
  FROM public.furniture_catalog AS fc
  WHERE fc.kind = p_kind
    AND fc.user_id = uid
    AND fc.is_builtin = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.furniture_catalog
  SET model_url = p_model_url,
      thumbnail_path = COALESCE(p_thumbnail_path, thumbnail_path),
      width_in = p_width_in,
      height_in = p_height_in,
      depth_in = p_depth_in
  WHERE kind = p_kind
    AND user_id = uid
    AND is_builtin = false;

  IF old_model_url IS NOT NULL AND btrim(old_model_url) <> '' THEN
    UPDATE public.room_items AS ri
    SET model_url = p_model_url
    FROM public.rooms AS r
    WHERE ri.room_id = r.id
      AND r.user_id = uid
      AND ri.model_url = old_model_url;

    GET DIAGNOSTICS updated_rooms = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'kind', p_kind,
    'old_model_url', old_model_url,
    'model_url', p_model_url,
    'updated_room_items', updated_rooms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_catalog_model_glb(text, text, text, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_catalog_model_glb(text, text, text, numeric, numeric, numeric) TO authenticated;
