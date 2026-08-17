-- Framed mirror GLB (15 x 56 x 0.5 in) for checklist placement.
-- Applied remotely via Supabase MCP; kept here for repo parity.

INSERT INTO public.furniture_catalog (
  kind, label, description, width_in, height_in, depth_in, clearance_in,
  is_builtin, model_url, tags, categories, visibility
) VALUES (
  'checklist-mirror',
  'Mirror',
  '15 x 56 x 0.5 in framed mirror for checklist placement',
  15, 56, 0.5, null,
  true,
  'checklist-refs/glb/mirror.glb',
  '{}'::text[],
  ARRAY['decor_art'],
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
SET place_catalog_kind = 'checklist-mirror',
    place_builtin_kind = NULL,
    updated_at = now()
WHERE slug IN ('largemirror', 'wallmirror');
