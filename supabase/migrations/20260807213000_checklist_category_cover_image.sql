-- Optional cover image for checklist gallery categories (top-level groups and subcategories).

ALTER TABLE public.checklist_categories
  ADD COLUMN IF NOT EXISTS image_path text;
