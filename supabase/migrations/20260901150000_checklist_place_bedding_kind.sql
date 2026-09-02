-- Link checklist products to bed inspector bedding layers (sheets / comforter / pillow).

ALTER TABLE public.curated_products
  ADD COLUMN IF NOT EXISTS place_bedding_kind text;

ALTER TABLE public.curated_products
  DROP CONSTRAINT IF EXISTS curated_products_place_one_chk;

ALTER TABLE public.curated_products
  ADD CONSTRAINT curated_products_place_one_chk CHECK (
    (place_builtin_kind IS NOT NULL)::int
    + (place_catalog_kind IS NOT NULL)::int
    + (place_hanging_kind IS NOT NULL)::int
    + (place_bedding_kind IS NOT NULL)::int <= 1
  );

ALTER TABLE public.curated_products
  ADD CONSTRAINT curated_products_place_bedding_kind_chk CHECK (
    place_bedding_kind IS NULL OR place_bedding_kind IN ('sheets', 'comforter', 'pillow')
  );

UPDATE public.curated_products
SET place_bedding_kind = 'sheets',
    updated_at = now()
WHERE slug = 'bed-sheets';

UPDATE public.curated_products
SET place_bedding_kind = 'comforter',
    updated_at = now()
WHERE slug = 'bed-comforter';

UPDATE public.curated_products
SET place_bedding_kind = 'pillow',
    updated_at = now()
WHERE slug = 'pillows';
