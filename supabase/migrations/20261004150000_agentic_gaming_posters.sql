-- CC0 / public-domain agentic poster bank (built via scripts/build-poster-bank.mjs)

INSERT INTO public.furniture_catalog (
  kind, label, description, width_in, height_in, depth_in, clearance_in,
  is_builtin, model_url, thumbnail_path, tags, categories, visibility
) VALUES
(
  'poster-pixel-blocks',
  'Green pixel block landscape wall poster',
  'Green pixel block landscape wall poster — CC0/public-domain Toova poster bank',
  24, 36, 0.5, null,
  true,
  'checklist-refs/glb/posters/poster-pixel-blocks.glb',
  'checklist-refs/images/posters/poster-pixel-blocks.png',
  '{"pixel","block","voxel","gaming","landscape","8-bit","grass","poster"}'::text[],
  ARRAY['decor_art'],
  'public'
),
(
  'poster-ascii-gaming',
  'Retro ASCII gaming wall poster',
  'Retro ASCII gaming wall poster — CC0/public-domain Toova poster bank',
  24, 36, 0.5, null,
  true,
  'checklist-refs/glb/posters/poster-ascii-gaming.glb',
  'checklist-refs/images/posters/poster-ascii-gaming.png',
  '{"ascii","retro","gaming","terminal","8-bit","pixel","poster"}'::text[],
  ARRAY['decor_art'],
  'public'
),
(
  'poster-retro-arcade',
  'Retro arcade gaming wall poster',
  'Retro arcade gaming wall poster — CC0/public-domain Toova poster bank',
  24, 36, 0.5, null,
  true,
  'checklist-refs/glb/posters/poster-retro-arcade.glb',
  'checklist-refs/images/posters/poster-retro-arcade.png',
  '{"arcade","retro","gaming","neon","cabinet","pixel","poster"}'::text[],
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
    thumbnail_path = EXCLUDED.thumbnail_path,
    tags = EXCLUDED.tags,
    categories = EXCLUDED.categories,
    is_builtin = true,
    visibility = 'public';
