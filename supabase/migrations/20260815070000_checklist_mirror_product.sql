-- Wire generic Mirror checklist product to the framed mirror catalog GLB.
-- Small desk mirror intentionally left without a placeable model (wrong scale).

UPDATE public.curated_products
SET place_catalog_kind = 'checklist-mirror',
    place_builtin_kind = NULL,
    updated_at = now()
WHERE slug = 'mirror';
