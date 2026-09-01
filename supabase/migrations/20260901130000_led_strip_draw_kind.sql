-- Separate LED strips from fairy lights: led1 uses straight-run draw feature.

ALTER TABLE public.curated_products
  DROP CONSTRAINT IF EXISTS curated_products_place_hanging_kind_chk;

ALTER TABLE public.curated_products
  ADD CONSTRAINT curated_products_place_hanging_kind_chk CHECK (
    place_hanging_kind IS NULL OR place_hanging_kind IN ('lights', 'leaves', 'led-strip')
  );

UPDATE public.curated_products
SET place_hanging_kind = 'led-strip',
    place_catalog_kind = NULL,
    updated_at = now()
WHERE slug = 'led1';
