-- Storage bins are shop-only accessories; cube storage maps to the open-cube bookshelf builtin.

UPDATE public.curated_products
SET place_builtin_kind = NULL,
    updated_at = now()
WHERE slug = 'storage-1';

UPDATE public.curated_products
SET place_builtin_kind = 'bookshelf',
    updated_at = now()
WHERE slug = 'storage-2';
