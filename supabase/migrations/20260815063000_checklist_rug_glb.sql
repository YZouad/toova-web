-- Flat rug GLB (4 x 5.9 ft, 0.5 in thick) for checklist placement.
-- Applied remotely via Supabase MCP; kept here for repo parity.

INSERT INTO public.furniture_catalog (
  kind, label, description, width_in, height_in, depth_in, clearance_in,
  is_builtin, model_url, tags, categories, visibility
) VALUES (
  'checklist-rug',
  'Rug',
  '4 x 5.9 ft rug, 0.5 in thick, for checklist placement',
  48, 0.5, 70.8, null,
  true,
  'checklist-refs/glb/rug.glb',
  '{}'::text[],
  ARRAY['rugs'],
  'public'
)
ON CONFLICT (kind) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    width_in = EXCLUDED.width_in,
    height_in = EXCLUDED.height_in,
    depth_in = EXCLUDED.depth_in,
    model_url = EXCLUDED.model_url,
    categories = EXCLUDED.categories,
    is_builtin = true,
    visibility = 'public';

UPDATE public.curated_products
SET place_catalog_kind = 'checklist-rug',
    place_builtin_kind = NULL,
    updated_at = now()
WHERE slug = 'rug';
