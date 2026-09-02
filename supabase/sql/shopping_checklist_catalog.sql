-- Shopping checklist catalog: categories, curated products, progress, shopping list,
-- room_items.curated_product_id, product-images bucket, and get_shared_room enrichment.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curated_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.checklist_categories (id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  retailer text NOT NULL DEFAULT 'Amazon',
  affiliate_url text NOT NULL,
  price_cents integer,
  currency text NOT NULL DEFAULT 'USD',
  image_path text,
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  last_verified_at timestamptz,
  -- Optional 3D placement mapping
  place_builtin_kind text,
  place_catalog_kind text REFERENCES public.furniture_catalog (kind) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug),
  CONSTRAINT curated_products_place_one_chk CHECK (
    place_builtin_kind IS NULL OR place_catalog_kind IS NULL
  ),
  CONSTRAINT curated_products_price_nonneg_chk CHECK (
    price_cents IS NULL OR price_cents >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_curated_products_category
  ON public.curated_products (category_id, sort_order);

CREATE TABLE IF NOT EXISTS public.user_checklist_progress (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.checklist_categories (id) ON DELETE CASCADE,
  checked boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category_id)
);

CREATE TABLE IF NOT EXISTS public.user_shopping_list (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.curated_products (id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  review_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id),
  CONSTRAINT user_shopping_list_qty_chk CHECK (quantity > 0)
);

ALTER TABLE public.room_items
  ADD COLUMN IF NOT EXISTS curated_product_id uuid
    REFERENCES public.curated_products (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_room_items_curated_product
  ON public.room_items (curated_product_id)
  WHERE curated_product_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.checklist_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curated_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_checklist_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_shopping_list ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS checklist_categories_admin_write ON public.checklist_categories;
CREATE POLICY checklist_categories_admin_write ON public.checklist_categories
  FOR ALL
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

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

DROP POLICY IF EXISTS curated_products_admin_write ON public.curated_products;
CREATE POLICY curated_products_admin_write ON public.curated_products
  FOR ALL
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS user_checklist_progress_owner ON public.user_checklist_progress;
CREATE POLICY user_checklist_progress_owner ON public.user_checklist_progress
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_shopping_list_owner ON public.user_shopping_list;
CREATE POLICY user_shopping_list_owner ON public.user_shopping_list
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT ON TABLE public.checklist_categories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.checklist_categories TO authenticated;

GRANT SELECT ON TABLE public.curated_products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.curated_products TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_checklist_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_shopping_list TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Product images storage
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS product_images_public_read ON storage.objects;
CREATE POLICY product_images_public_read ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS product_images_admin_insert ON storage.objects;
CREATE POLICY product_images_admin_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS product_images_admin_update ON storage.objects;
CREATE POLICY product_images_admin_update ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS product_images_admin_delete ON storage.objects;
CREATE POLICY product_images_admin_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.is_admin((SELECT auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 4) Seed categories + products (from existing dorm checklist affiliate links)
-- ---------------------------------------------------------------------------
INSERT INTO public.checklist_categories (slug, name, sort_order, published)
VALUES
  ('lamp', 'Lamp', 10, true),
  ('desk', 'Desk or standing?', 20, true),
  ('command-strips', 'Command Strips', 30, true),
  ('power-strip', 'Power Strip / Extension cord', 40, true),
  ('shower-shoes', 'Shower Shoes', 50, true),
  ('towel', 'Towel', 60, true),
  ('medicine', 'Medicine', 70, true),
  ('laundry-basket', 'Laundry Basket', 80, true),
  ('clock', 'Clock', 90, true),
  ('storage', 'Storage', 100, true),
  ('hangers', 'Hangers', 110, true),
  ('cutlery', 'Cutlery / plates', 120, true),
  ('soap', 'Soap', 130, true),
  ('door-hangers', 'Door hangers', 140, true),
  ('bed-pillow', 'Work in bed pillow', 150, true),
  ('charger', '3-in-one charger', 160, true)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, published = EXCLUDED.published, updated_at = now();

-- Helper: upsert product by category slug + product slug
WITH cats AS (
  SELECT id, slug FROM public.checklist_categories
),
seed(cat_slug, prod_slug, name, description, affiliate_url, price_cents, sort_order, place_builtin) AS (
  VALUES
    -- Lamp: three curated samples (placeable via builtin lamp)
    ('lamp', 'desk-lamp-warm', 'Warm desk lamp', 'Compact warm LED desk lamp for late study sessions.', 'https://amzn.to/4c1ATHP', 2499, 10, 'lamp'),
    ('lamp', 'clamp-lamp', 'Clamp lamp', 'Space-saving clamp lamp for loft beds and shelves.', 'https://amzn.to/4c1ATHP', 1899, 20, 'lamp'),
    ('lamp', 'floor-lamp-slim', 'Slim floor lamp', 'Narrow footprint floor lamp that fits tight dorm corners.', 'https://amzn.to/4c1ATHP', 3499, 30, 'lamp'),
    -- Other categories: one product per existing affiliate link
    ('command-strips', 'command-strips', 'Command Strips', 'Damage-free hanging strips for dorm walls.', 'https://amzn.to/4gQKEMp', 1299, 10, NULL),
    ('power-strip', 'power-strip', 'Power strip / extension', 'Surge-protected strip for limited outlets.', 'https://amzn.to/4fkBEhp', 1899, 10, NULL),
    ('shower-shoes', 'shower-shoes', 'Shower shoes', 'Quick-dry slides for shared bathrooms.', 'https://amzn.to/4fl8i2p', 1599, 10, NULL),
    ('towel', 'towel', 'Bath towel', 'Soft everyday bath towel.', 'https://amzn.to/4fRhV9c', 1499, 10, NULL),
    ('medicine', 'medicine', 'Basic medicine kit', 'Starter cold / pain relief essentials.', 'https://amzn.to/3RgsYQ2', 2199, 10, NULL),
    ('laundry-basket', 'laundry-basket-1', 'Collapsible laundry basket', 'Folds flat when not in use.', 'https://amzn.to/4fE6m43', 1699, 10, NULL),
    ('laundry-basket', 'laundry-basket-2', 'Rolling laundry hamper', 'Wheeled hamper for laundry day hauls.', 'https://amzn.to/45kfRjZ', 2499, 20, NULL),
    ('clock', 'clock', 'Alarm clock', 'Simple bedside alarm clock.', 'https://amzn.to/4w8e9gR', 1799, 10, NULL),
    ('storage', 'storage-1', 'Under-bed storage bins', 'Shallow bins that slide under a twin bed.', 'https://amzn.to/4yGnG0P', 2999, 10, NULL),
    ('storage', 'storage-2', 'Cube storage unit', 'Open cubes for crates and baskets.', 'https://amzn.to/4vRbYhp', 3999, 20, 'bookshelf'),
    ('hangers', 'hangers', 'Velvet hangers', 'Slim hangers that save closet space.', 'https://amzn.to/4fn5aDm', 1499, 10, NULL),
    ('cutlery', 'cutlery', 'Plate + cutlery set', 'Reusable plates and utensils for the dorm.', 'https://amzn.to/4c1AYv7', 1999, 10, NULL),
    ('soap', 'soap', 'Soap + caddy', 'Body wash and a simple shower caddy.', 'https://amzn.to/3TEkJhj', 1299, 10, NULL),
    ('door-hangers', 'door-hangers-1', 'Over-door hooks', 'Hooks that hang over the closet door.', 'https://amzn.to/4wWj6de', 1499, 10, NULL),
    ('door-hangers', 'door-hangers-2', 'Over-door organizer', 'Multi-pocket organizer for the door.', 'https://amzn.to/3RUQWR1', 2199, 20, NULL),
    ('bed-pillow', 'bed-pillow', 'Work-in-bed pillow', 'Reading / laptop pillow for bed.', 'https://amzn.to/3TnVhws', 2999, 10, NULL),
    ('charger', 'charger', '3-in-1 charger', 'Multi-tip charging cable for phone and earbuds.', 'https://amzn.to/4wnvoeI', 1599, 10, NULL),
    ('desk', 'desk-placeholder', 'Desk (coming soon)', 'We are curating desk picks — place a desk from the palette for now.', 'https://www.amazon.com/s?k=dorm+desk', NULL, 10, 'desk')
)
INSERT INTO public.curated_products (
  category_id, slug, name, description, affiliate_url, price_cents, currency,
  sort_order, published, last_verified_at, place_builtin_kind
)
SELECT
  c.id,
  s.prod_slug,
  s.name,
  s.description,
  s.affiliate_url,
  s.price_cents,
  'USD',
  s.sort_order,
  true,
  now(),
  s.place_builtin
FROM seed s
JOIN cats c ON c.slug = s.cat_slug
ON CONFLICT (category_id, slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  affiliate_url = EXCLUDED.affiliate_url,
  price_cents = EXCLUDED.price_cents,
  sort_order = EXCLUDED.sort_order,
  published = EXCLUDED.published,
  place_builtin_kind = EXCLUDED.place_builtin_kind,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 5) Enrich get_shared_room with published product metadata
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shared_room(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  share_row public.room_shares%ROWTYPE;
  room_row public.rooms%ROWTYPE;
  owner_name text;
  owner_handle text;
  items_json jsonb;
  dims_json jsonb;
  products_json jsonb;
  paths text[];
  thumb text;
BEGIN
  IF NOT public.is_share_token_format(p_token) THEN
    RAISE EXCEPTION 'invalid share link'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO share_row
  FROM public.room_shares s
  WHERE s.token = p_token
    AND s.revoked_at IS NULL
    AND (s.expires_at IS NULL OR s.expires_at > now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid share link'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO room_row
  FROM public.rooms r
  WHERE r.id = share_row.room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid share link'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.room_shares
  SET view_count = view_count + 1
  WHERE token = p_token;

  owner_name := COALESCE(private.safe_owner_display(room_row.user_id), 'Toova designer');
  owner_handle := private.safe_owner_handle(room_row.user_id);
  thumb := NULLIF(trim(room_row.thumbnail_path), '');

  SELECT COALESCE(jsonb_agg(to_jsonb(ri) ORDER BY ri.sort_order), '[]'::jsonb)
  INTO items_json
  FROM public.room_items ri
  WHERE ri.room_id = room_row.id;

  SELECT COALESCE(
    jsonb_object_agg(
      fc.model_url,
      jsonb_build_array(fc.width_in, fc.height_in, fc.depth_in)
    ),
    '{}'::jsonb
  )
  INTO dims_json
  FROM public.furniture_catalog fc
  WHERE fc.model_url IN (
    SELECT NULLIF(trim(ri.model_url), '')
    FROM public.room_items ri
    WHERE ri.room_id = room_row.id
      AND ri.kind = 'imported'
      AND ri.model_url IS NOT NULL
      AND trim(ri.model_url) !~* '^https?://'
  );

  -- Only published products referenced by this room's items.
  SELECT COALESCE(
    jsonb_object_agg(
      cp.id::text,
      jsonb_build_object(
        'id', cp.id,
        'name', cp.name,
        'description', cp.description,
        'retailer', cp.retailer,
        'affiliate_url', cp.affiliate_url,
        'price_cents', cp.price_cents,
        'currency', cp.currency,
        'image_path', cp.image_path,
        'place_builtin_kind', cp.place_builtin_kind,
        'place_catalog_kind', cp.place_catalog_kind
      )
    ),
    '{}'::jsonb
  )
  INTO products_json
  FROM public.curated_products cp
  JOIN public.checklist_categories cc ON cc.id = cp.category_id
  WHERE cp.published = true
    AND cc.published = true
    AND cp.id IN (
      SELECT ri.curated_product_id
      FROM public.room_items ri
      WHERE ri.room_id = room_row.id
        AND ri.curated_product_id IS NOT NULL
    );

  PERFORM public._grant_share_assets(p_token, room_row.id);

  SELECT COALESCE(array_agg(g.object_path), '{}'::text[])
  INTO paths
  FROM public.share_asset_grants g
  WHERE g.token = p_token
    AND g.expires_at > now()
    AND (thumb IS NULL OR g.object_path IS DISTINCT FROM thumb);

  RETURN jsonb_build_object(
    'room', jsonb_build_object(
      'id', room_row.id,
      'name', room_row.name,
      'environment', room_row.environment,
      'room_geometry', room_row.room_geometry,
      'fork_count', room_row.fork_count,
      'thumbnail_path', thumb
    ),
    'items', items_json,
    'catalog_dims', COALESCE(dims_json, '{}'::jsonb),
    'published_products', COALESCE(products_json, '{}'::jsonb),
    'asset_paths', to_jsonb(paths),
    'role', share_row.role,
    'allow_copy', share_row.allow_copy,
    'owner_display', owner_name,
    'owner_handle', owner_handle,
    'attribution', private.public_attribution(room_row.forked_from)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_shared_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_room(text) TO anon, authenticated;
