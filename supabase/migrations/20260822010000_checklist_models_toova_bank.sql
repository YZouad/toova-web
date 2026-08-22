-- Add remaining checklist-refs GLBs to the Toova bank (is_builtin) and
-- file them under existing gallery categories. Applied remotely via MCP.

INSERT INTO public.furniture_catalog (
  kind, label, description, width_in, height_in, depth_in, clearance_in,
  is_builtin, model_url, thumbnail_path, tags, categories, visibility
) VALUES
  (
    'checklist-desklamp', 'Desk lamp', 'Warm desk lamp from the dorm checklist',
    5.5, 16, 14.2, null, true,
    'checklist-refs/glb/desklamp.glb', 'checklist-refs/images/desklamp.webp',
    '{}'::text[], ARRAY['lighting'], 'public'
  ),
  (
    'checklist-talllamp1', 'Floor lamp', '64.6 in standing floor lamp',
    13, 65, 11.7, null, true,
    'checklist-refs/glb/talllamp1.glb', 'checklist-refs/images/talllamp1.jpg',
    '{}'::text[], ARRAY['lighting'], 'public'
  ),
  (
    'checklist-tallshelflamp', 'Shelf floor lamp', 'Corner floor lamp with display shelves',
    20.2, 63, 20.2, null, true,
    'checklist-refs/glb/tallshelflamp.glb', 'checklist-refs/images/tallshelflamp.jpg',
    '{}'::text[], ARRAY['lighting', 'storage'], 'public'
  ),
  (
    'checklist-clock2', 'Digital clock', 'Wooden digital alarm clock',
    3, 6, 2.9, null, true,
    'checklist-refs/glb/clock2.glb', 'checklist-refs/images/clock2.jpg',
    '{}'::text[], ARRAY['electronics', 'decor_art'], 'public'
  ),
  (
    'checklist-woodenclock', 'Wooden clock', 'Compact wooden desk clock',
    2.5, 6, 1.2, null, true,
    'checklist-refs/glb/woodenclock.glb', 'checklist-refs/images/woodenclock.jpg',
    '{}'::text[], ARRAY['electronics', 'decor_art'], 'public'
  ),
  (
    'checklist-pan1', 'Frying pan', 'Carbon steel frying pan',
    11, 2.3, 6.6, null, true,
    'checklist-refs/glb/pan1.glb', 'checklist-refs/images/pan1.jpg',
    '{}'::text[], ARRAY['kitchen'], 'public'
  ),
  (
    'checklist-closetclothorganizer', 'Closet organizer', 'Hanging 6-shelf closet organizer',
    13.9, 48, 13.4, null, true,
    'checklist-refs/glb/closetclothorganizer.glb', 'checklist-refs/images/closetclothorganizer.jpg',
    '{}'::text[], ARRAY['storage'], 'public'
  ),
  (
    'checklist-leaves', 'Ivy garland', 'Artificial ivy leaves for wall or shelf',
    36, 36, 0.7, null, true,
    'checklist-refs/glb/leaves.glb', 'checklist-refs/images/leaves.jpg',
    '{}'::text[], ARRAY['plants', 'decor_art'], 'public'
  ),
  (
    'checklist-led1', 'LED light strips', 'Color-changing LED strip lights',
    20, 20, 16.8, null, true,
    'checklist-refs/glb/led1.glb', 'checklist-refs/images/led1.jpg',
    '{}'::text[], ARRAY['lighting'], 'public'
  ),
  (
    'checklist-fairlylights1', 'Fairy lights', 'String fairy lights',
    20, 9.9, 14.5, null, true,
    'checklist-refs/glb/fairlylights1.glb', 'checklist-refs/images/fairlylights1.jpg',
    '{}'::text[], ARRAY['lighting', 'decor_art'], 'public'
  ),
  (
    'checklist-wallmirror', 'Wall mirror', 'Slim wall or floor mirror',
    15.7, 24, 17.4, null, true,
    'checklist-refs/glb/wallmirror.glb', 'checklist-refs/images/wallmirror.jpg',
    '{}'::text[], ARRAY['decor_art'], 'public'
  ),
  (
    'checklist-largemirror', 'Floor mirror', 'Full-length standing mirror',
    36, 36, 23, null, true,
    'checklist-refs/glb/largemirror.glb', 'checklist-refs/images/largemirror.jpg',
    '{}'::text[], ARRAY['decor_art'], 'public'
  ),
  (
    'checklist-smallmirror', 'Desk mirror', 'Small standing desk mirror',
    8, 7.3, 0.2, null, true,
    'checklist-refs/glb/smallmirror.glb', 'checklist-refs/images/smallmirror.jpg',
    '{}'::text[], ARRAY['decor_art'], 'public'
  )
ON CONFLICT (kind) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    width_in = EXCLUDED.width_in,
    height_in = EXCLUDED.height_in,
    depth_in = EXCLUDED.depth_in,
    model_url = EXCLUDED.model_url,
    thumbnail_path = EXCLUDED.thumbnail_path,
    categories = EXCLUDED.categories,
    is_builtin = true,
    visibility = 'public';

UPDATE public.furniture_catalog
SET thumbnail_path = 'checklist-refs/images/largerwhiteboard.jpg'
WHERE kind = 'checklist-whiteboard' AND thumbnail_path IS NULL;

UPDATE public.furniture_catalog
SET thumbnail_path = 'checklist-refs/images/largemirror.jpg'
WHERE kind = 'checklist-mirror' AND thumbnail_path IS NULL;

-- Point matching checklist products at the new bank models when they still
-- use a generic builtin lamp or have no placeable model.
UPDATE public.curated_products
SET place_catalog_kind = 'checklist-desklamp',
    place_builtin_kind = NULL,
    updated_at = now()
WHERE slug = 'desklamp';

UPDATE public.curated_products
SET place_catalog_kind = 'checklist-talllamp1',
    place_builtin_kind = NULL,
    updated_at = now()
WHERE slug = 'talllamp1';

UPDATE public.curated_products
SET place_catalog_kind = 'checklist-tallshelflamp',
    place_builtin_kind = NULL,
    updated_at = now()
WHERE slug = 'tallshelflamp';

UPDATE public.curated_products
SET place_catalog_kind = 'checklist-fairlylights1',
    place_builtin_kind = NULL,
    updated_at = now()
WHERE slug = 'fairlylights1' AND place_catalog_kind IS NULL;

UPDATE public.curated_products
SET place_catalog_kind = 'checklist-led1',
    place_builtin_kind = NULL,
    updated_at = now()
WHERE slug = 'led1' AND place_catalog_kind IS NULL;

UPDATE public.curated_products
SET place_catalog_kind = 'checklist-leaves',
    place_builtin_kind = NULL,
    updated_at = now()
WHERE slug = 'leaves' AND place_catalog_kind IS NULL;

UPDATE public.curated_products
SET place_catalog_kind = 'checklist-closetclothorganizer',
    place_builtin_kind = NULL,
    updated_at = now()
WHERE slug = 'closetclothorganizer' AND place_catalog_kind IS NULL;

UPDATE public.curated_products
SET place_catalog_kind = 'checklist-smallmirror',
    place_builtin_kind = NULL,
    updated_at = now()
WHERE slug = 'smallmirror' AND place_catalog_kind IS NULL;
