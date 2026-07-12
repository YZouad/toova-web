-- Tags on the furniture catalog (one array per `kind`, e.g. bed → {'sleep','bedroom'}).
--
-- If you previously ran the old `room_item_tags.sql` (junction table + per-user `tags`):
--   this migration drops those tables and moves tagging to `furniture_catalog.tags`.
--
-- Run in Supabase → SQL Editor.

BEGIN;

-- Remove instance-level tagging (placed object ↔ tag links)
DROP TABLE IF EXISTS public.room_item_tag_assignments CASCADE;
DROP TABLE IF EXISTS public.tags CASCADE;

-- Catalog-level tags (Postgres text array)
ALTER TABLE public.furniture_catalog
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

-- Optional: fast “does catalog row contain tag X?” queries
CREATE INDEX IF NOT EXISTS idx_furniture_catalog_tags_gin
  ON public.furniture_catalog USING GIN (tags);

COMMIT;

-- Examples (edit per kind):
-- UPDATE public.furniture_catalog SET tags = ARRAY['bedroom','sleep'] WHERE kind = 'bed';
-- UPDATE public.furniture_catalog SET tags = ARRAY['storage'] WHERE kind = 'wardrobe';
--
-- In the app, resolve tags for a placed item with:
--   SELECT tags FROM furniture_catalog WHERE kind = room_items.kind
--   (imported models have no catalog row unless you add one).
