-- Open-shelf builtin matching the dresser footprint (no drawers).

INSERT INTO public.furniture_catalog (
  kind, label, description, width_in, height_in, depth_in, clearance_in,
  is_builtin, model_url, tags, categories, visibility
) VALUES (
  'bookshelf',
  'Bookshelf',
  'Open shelf unit with the same footprint as the dresser.',
  30, 32, 18, null,
  true,
  null,
  '{}'::text[],
  ARRAY['storage'],
  'public'
)
ON CONFLICT (kind) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    width_in = EXCLUDED.width_in,
    height_in = EXCLUDED.height_in,
    depth_in = EXCLUDED.depth_in,
    categories = EXCLUDED.categories,
    is_builtin = true,
    visibility = 'public';

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
      'bed', 'dresser', 'bookshelf', 'wardrobe', 'desk', 'chair', 'nightstand', 'lamp', 'imported'
    );
$$;

REVOKE ALL ON FUNCTION private.room_preview_items(uuid) FROM PUBLIC, anon, authenticated;
