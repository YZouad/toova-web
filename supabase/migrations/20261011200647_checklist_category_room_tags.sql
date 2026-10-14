-- Room-area tags on shopping checklist categories.
-- Empty array = category shows for every area (default).

ALTER TABLE public.checklist_categories
  ADD COLUMN IF NOT EXISTS room_tags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.checklist_categories.room_tags IS
  'Room area tags (bedroom, kitchen, …). Empty means visible for all areas.';

-- Seed obvious dorm / room mappings from existing category slugs.
UPDATE public.checklist_categories SET room_tags = ARRAY['dorm', 'bedroom', 'office']
WHERE slug IN ('lamp', 'desk', 'power-strip', 'charger', 'clock', 'command-strips', 'door-hangers')
  AND (room_tags IS NULL OR room_tags = '{}');

UPDATE public.checklist_categories SET room_tags = ARRAY['dorm', 'bathroom']
WHERE slug IN ('shower-shoes', 'towel', 'soap', 'medicine')
  AND (room_tags IS NULL OR room_tags = '{}');

UPDATE public.checklist_categories SET room_tags = ARRAY['dorm', 'laundry']
WHERE slug IN ('laundry-basket')
  AND (room_tags IS NULL OR room_tags = '{}');

UPDATE public.checklist_categories SET room_tags = ARRAY['dorm', 'bedroom', 'closet']
WHERE slug IN ('storage', 'hangers', 'bed-pillow')
  AND (room_tags IS NULL OR room_tags = '{}');

UPDATE public.checklist_categories SET room_tags = ARRAY['dorm', 'kitchen', 'dining']
WHERE slug IN ('cutlery')
  AND (room_tags IS NULL OR room_tags = '{}');

-- Hierarchical reseed parents (when present)
UPDATE public.checklist_categories SET room_tags = ARRAY['dorm', 'bedroom']
WHERE slug IN ('bedding', 'sleep', 'bed')
  AND (room_tags IS NULL OR room_tags = '{}');

UPDATE public.checklist_categories SET room_tags = ARRAY['dorm', 'bathroom']
WHERE slug IN ('bathroom', 'shower', 'toiletries', 'personal-care')
  AND (room_tags IS NULL OR room_tags = '{}');

UPDATE public.checklist_categories SET room_tags = ARRAY['dorm', 'kitchen']
WHERE slug IN ('kitchen', 'appliances', 'food')
  AND (room_tags IS NULL OR room_tags = '{}');

UPDATE public.checklist_categories SET room_tags = ARRAY['dorm', 'laundry']
WHERE slug IN ('laundry', 'hamper')
  AND (room_tags IS NULL OR room_tags = '{}');
