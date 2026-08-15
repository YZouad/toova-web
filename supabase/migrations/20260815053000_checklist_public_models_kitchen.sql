-- Checklist-linked catalog models must be public so anyone can Place them.
-- Applied remotely via Supabase MCP; kept here for repo parity.

UPDATE public.furniture_catalog
SET visibility = 'public'
WHERE kind IN (
  SELECT place_catalog_kind
  FROM public.curated_products
  WHERE place_catalog_kind IS NOT NULL
)
AND visibility IS DISTINCT FROM 'public';

UPDATE public.checklist_categories
SET name = 'Kitchen',
    slug = 'kitchen',
    updated_at = now()
WHERE slug = 'food';

UPDATE public.checklist_categories
SET parent_id = (
      SELECT id FROM public.checklist_categories WHERE slug = 'kitchen' LIMIT 1
    ),
    updated_at = now()
WHERE slug = 'waterbottle';
