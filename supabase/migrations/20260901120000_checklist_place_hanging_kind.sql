-- Link checklist products to procedural hanging draw features (string lights / leaves).

ALTER TABLE public.curated_products
  ADD COLUMN IF NOT EXISTS place_hanging_kind text;

ALTER TABLE public.curated_products
  DROP CONSTRAINT IF EXISTS curated_products_place_one_chk;

ALTER TABLE public.curated_products
  ADD CONSTRAINT curated_products_place_one_chk CHECK (
    (place_builtin_kind IS NOT NULL)::int
    + (place_catalog_kind IS NOT NULL)::int
    + (place_hanging_kind IS NOT NULL)::int <= 1
  );

ALTER TABLE public.curated_products
  ADD CONSTRAINT curated_products_place_hanging_kind_chk CHECK (
    place_hanging_kind IS NULL OR place_hanging_kind IN ('lights', 'leaves', 'led-strip')
  );

-- Fairy lights and LED strips → draw string lights; ivy garland → draw leaves.
UPDATE public.curated_products
SET place_hanging_kind = 'lights',
    place_catalog_kind = NULL,
    updated_at = now()
WHERE slug IN ('fairlylights1', 'led1');

UPDATE public.curated_products
SET place_hanging_kind = 'leaves',
    place_catalog_kind = NULL,
    updated_at = now()
WHERE slug = 'leaves';
