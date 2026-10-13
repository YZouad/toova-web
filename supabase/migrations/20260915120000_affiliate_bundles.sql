-- Curated affiliate bundles (multi-add Amazon cart + room placement).

ALTER TABLE public.curated_products
  ADD COLUMN IF NOT EXISTS asin text;

UPDATE public.curated_products
SET asin = upper((regexp_match(affiliate_url, '/dp/([A-Za-z0-9]{10})'))[1])
WHERE asin IS NULL
  AND affiliate_url ~* '/dp/[A-Za-z0-9]{10}';

UPDATE public.curated_products
SET asin = upper((regexp_match(affiliate_url, '/gp/product/([A-Za-z0-9]{10})'))[1])
WHERE asin IS NULL
  AND affiliate_url ~* '/gp/product/[A-Za-z0-9]{10}';

CREATE TABLE IF NOT EXISTS public.bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  hero_image_path text,
  tags text[] NOT NULL DEFAULT '{}',
  published boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bundle_items (
  bundle_id uuid NOT NULL REFERENCES public.bundles (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.curated_products (id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 1,
  placement_preset jsonb,
  sort_order int NOT NULL DEFAULT 0,
  PRIMARY KEY (bundle_id, product_id),
  CONSTRAINT bundle_items_qty_chk CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_bundles_published_sort
  ON public.bundles (published, sort_order);

ALTER TABLE public.bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY bundles_read_published ON public.bundles
  FOR SELECT TO authenticated, anon
  USING (published = true);

CREATE POLICY bundle_items_read_published ON public.bundle_items
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.bundles b
      WHERE b.id = bundle_id AND b.published = true
    )
  );

CREATE POLICY bundles_admin_all ON public.bundles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY bundle_items_admin_all ON public.bundle_items
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.list_published_bundles()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(bundle ORDER BY sort_order, title)
    FROM (
      SELECT jsonb_build_object(
        'id', b.id,
        'slug', b.slug,
        'title', b.title,
        'description', b.description,
        'hero_image_path', b.hero_image_path,
        'tags', COALESCE(b.tags, '{}'::text[]),
        'sort_order', b.sort_order,
        'items', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'product_id', bi.product_id,
              'quantity', bi.quantity,
              'sort_order', bi.sort_order,
              'placement_preset', bi.placement_preset,
              'product', jsonb_build_object(
                'id', cp.id,
                'name', cp.name,
                'affiliate_url', cp.affiliate_url,
                'asin', cp.asin,
                'retailer', cp.retailer,
                'price_cents', cp.price_cents,
                'place_builtin_kind', cp.place_builtin_kind,
                'place_catalog_kind', cp.place_catalog_kind
              )
            )
            ORDER BY bi.sort_order, cp.name
          )
          FROM public.bundle_items bi
          JOIN public.curated_products cp ON cp.id = bi.product_id
          WHERE bi.bundle_id = b.id AND cp.published = true
        ), '[]'::jsonb)
      ) AS bundle,
      b.sort_order,
      b.title
      FROM public.bundles b
      WHERE b.published = true
    ) sub
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_published_bundles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_published_bundles() TO authenticated, anon;
