-- Hierarchical checklist: parent categories + leaf subcategories + full product seed.
-- Applied remotely via Supabase MCP; kept here for repo parity.

ALTER TABLE public.checklist_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.checklist_categories (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_checklist_categories_parent
  ON public.checklist_categories (parent_id, sort_order);

ALTER TABLE public.curated_products
  ALTER COLUMN affiliate_url SET DEFAULT '';
