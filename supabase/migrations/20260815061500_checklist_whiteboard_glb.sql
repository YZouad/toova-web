-- White rectangle GLB (24 x 18 x 0.5 in) for checklist whiteboard placement.
-- Applied remotely via Supabase MCP; kept here for repo parity.

INSERT INTO public.furniture_catalog (
  kind, label, description, width_in, height_in, depth_in, clearance_in,
  is_builtin, model_url, tags, categories, visibility
) VALUES (
  'checklist-whiteboard',
  'Whiteboard',
  '24 x 18 x 0.5 in white board for checklist placement',
  24, 18, 0.5, null,
  true,
  'checklist-refs/glb/whiteboard-v2.glb',
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
SET place_catalog_kind = 'checklist-whiteboard',
    place_builtin_kind = NULL,
    updated_at = now()
WHERE slug IN ('largerwhiteboard', 'smallwhiteboard');
