-- Checklist public-read policies called is_admin(), but EXECUTE on is_admin
-- was revoked from anon by security hardening. That made SELECT fail for
-- anonymous (and any request evaluated as anon) with:
--   permission denied for function is_admin
--
-- Fix: keep public reads to published rows only (no is_admin), and add a
-- separate authenticated admin SELECT policy for unpublished drafts.

DROP POLICY IF EXISTS checklist_categories_public_read ON public.checklist_categories;
CREATE POLICY checklist_categories_public_read ON public.checklist_categories
  FOR SELECT
  TO anon, authenticated
  USING (published = true);

DROP POLICY IF EXISTS checklist_categories_admin_read ON public.checklist_categories;
CREATE POLICY checklist_categories_admin_read ON public.checklist_categories
  FOR SELECT
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS curated_products_public_read ON public.curated_products;
CREATE POLICY curated_products_public_read ON public.curated_products
  FOR SELECT
  TO anon, authenticated
  USING (
    published = true
    AND EXISTS (
      SELECT 1 FROM public.checklist_categories c
      WHERE c.id = category_id AND c.published = true
    )
  );

DROP POLICY IF EXISTS curated_products_admin_read ON public.curated_products;
CREATE POLICY curated_products_admin_read ON public.curated_products
  FOR SELECT
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())));
