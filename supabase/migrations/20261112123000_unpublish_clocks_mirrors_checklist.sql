-- Remove duplicate / low-quality checklist clocks and wall/floor mirrors from
-- the shopping checklist and the Toova Add-to-room gallery (still placeable if
-- already in a saved room via stored catalogKind).

UPDATE public.furniture_catalog
SET show_in_gallery = false
WHERE kind IN (
  'checklist-wallmirror',
  'checklist-largemirror',
  'checklist-clock2',
  'checklist-woodenclock'
);

UPDATE public.curated_products
SET
  published = false,
  place_catalog_kind = NULL,
  place_builtin_kind = NULL,
  updated_at = now()
WHERE slug IN ('wallmirror', 'largemirror', 'woodenclock', 'clock2', 'clock')
   OR place_catalog_kind IN (
     'checklist-wallmirror',
     'checklist-largemirror',
     'checklist-clock2',
     'checklist-woodenclock'
   );
