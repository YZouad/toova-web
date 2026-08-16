-- Enrich curated_products with Amazon-like detail fields for the shopping drawer.
-- Ratings / availability are optional; seed only honest known metadata.

ALTER TABLE public.curated_products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS feature_bullets text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS dimensions_text text,
  ADD COLUMN IF NOT EXISTS rating numeric(2,1),
  ADD COLUMN IF NOT EXISTS review_count integer,
  ADD COLUMN IF NOT EXISTS availability text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'curated_products_rating_chk'
  ) THEN
    ALTER TABLE public.curated_products
      ADD CONSTRAINT curated_products_rating_chk
      CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'curated_products_review_count_chk'
  ) THEN
    ALTER TABLE public.curated_products
      ADD CONSTRAINT curated_products_review_count_chk
      CHECK (review_count IS NULL OR review_count >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.curated_products.brand IS 'Optional brand / manufacturer label shown above the title.';
COMMENT ON COLUMN public.curated_products.feature_bullets IS 'Short bullet list of product highlights.';
COMMENT ON COLUMN public.curated_products.dimensions_text IS 'Human-readable size or pack details.';
COMMENT ON COLUMN public.curated_products.rating IS 'Optional average rating 0–5 when known and verified.';
COMMENT ON COLUMN public.curated_products.review_count IS 'Optional review count paired with rating.';
COMMENT ON COLUMN public.curated_products.availability IS 'Optional availability note, e.g. In stock.';

-- Seed descriptive metadata only (no fabricated ratings).
WITH updates(prod_slug, brand, bullets, dimensions_text, availability) AS (
  VALUES
    (
      'desk-lamp-warm',
      'Toova pick',
      ARRAY[
        'Warm LED light for late study sessions',
        'Compact footprint for crowded desks',
        'Simple on/off controls'
      ]::text[],
      'About 14″ tall',
      NULL
    ),
    (
      'clamp-lamp',
      'Toova pick',
      ARRAY[
        'Clamps to loft beds and shelves',
        'Saves desk surface space',
        'Adjustable arm'
      ]::text[],
      'Clamp opening up to ~2″',
      NULL
    ),
    (
      'floor-lamp-slim',
      'Toova pick',
      ARRAY[
        'Narrow base for tight dorm corners',
        'Soft ambient light',
        'Freestanding — no wall mounts needed'
      ]::text[],
      'About 60″ tall',
      NULL
    ),
    (
      'command-strips',
      'Command',
      ARRAY[
        'Damage-free hanging for dorm walls',
        'Removes cleanly when directions are followed',
        'Useful for frames, hooks, and lightweight décor'
      ]::text[],
      'Assorted pack',
      NULL
    ),
    (
      'power-strip',
      'Toova pick',
      ARRAY[
        'Surge protection for limited outlets',
        'Long cord for beds and desks far from the wall',
        'Multiple outlets for chargers and lamps'
      ]::text[],
      NULL,
      NULL
    ),
    (
      'shower-shoes',
      'Toova pick',
      ARRAY[
        'Quick-dry slides for shared bathrooms',
        'Lightweight for packing',
        'Easy to rinse and air-dry'
      ]::text[],
      NULL,
      NULL
    ),
    (
      'towel',
      'Toova pick',
      ARRAY[
        'Soft everyday bath towel',
        'Absorbent cotton blend',
        'Standard dorm size'
      ]::text[],
      NULL,
      NULL
    ),
    (
      'medicine',
      'Toova pick',
      ARRAY[
        'Starter cold and pain-relief essentials',
        'Travel-friendly packaging',
        'Keep in a labeled pouch for move-in'
      ]::text[],
      NULL,
      NULL
    ),
    (
      'laundry-basket-1',
      'Toova pick',
      ARRAY[
        'Collapses flat when empty',
        'Easy to stash under a bed',
        'Handles for laundry-day hauls'
      ]::text[],
      'Collapses flat',
      NULL
    ),
    (
      'laundry-basket-2',
      'Toova pick',
      ARRAY[
        'Wheeled hamper for laundry day',
        'Holds a full week of clothes',
        'Sturdy frame for elevators and sidewalks'
      ]::text[],
      NULL,
      NULL
    ),
    (
      'clock',
      'Toova pick',
      ARRAY[
        'Simple bedside alarm',
        'Easy-to-read display',
        'Battery backup friendly'
      ]::text[],
      NULL,
      NULL
    ),
    (
      'storage-1',
      'Toova pick',
      ARRAY[
        'Shallow bins that slide under a twin bed',
        'Dust covers keep clothes cleaner',
        'Stackable when not under the bed'
      ]::text[],
      'Fits under most twin XL beds',
      NULL
    ),
    (
      'storage-2',
      'Toova pick',
      ARRAY[
        'Open cubes for crates and baskets',
        'Modular — grow as you need more storage',
        'Doubles as a room divider shelf'
      ]::text[],
      'Cube storage unit',
      NULL
    ),
    (
      'hangers',
      'Toova pick',
      ARRAY[
        'Slim velvet hangers save closet space',
        'Clothes stay put without slipping',
        'Uniform look for shared closets'
      ]::text[],
      'Pack of slim hangers',
      NULL
    ),
    (
      'cutlery',
      'Toova pick',
      ARRAY[
        'Reusable plates and utensils',
        'Microwave-safe pieces where labeled',
        'Compact for micro-fridge setups'
      ]::text[],
      NULL,
      NULL
    ),
    (
      'soap',
      'Toova pick',
      ARRAY[
        'Body wash plus a simple shower caddy',
        'Drain holes reduce mildew',
        'Fits over-the-door hooks'
      ]::text[],
      NULL,
      NULL
    ),
    (
      'door-hangers-1',
      'Toova pick',
      ARRAY[
        'Hooks that hang over the closet door',
        'No drilling required',
        'Great for towels, bags, and robes'
      ]::text[],
      'Over-door fit',
      NULL
    ),
    (
      'door-hangers-2',
      'Toova pick',
      ARRAY[
        'Multi-pocket door organizer',
        'Stores shoes, toiletries, or snacks',
        'Uses vertical space you already have'
      ]::text[],
      'Over-door organizer',
      NULL
    ),
    (
      'bed-pillow',
      'Toova pick',
      ARRAY[
        'Reading and laptop pillow for bed',
        'Arms support a book or tablet',
        'Useful when desk space is limited'
      ]::text[],
      NULL,
      NULL
    ),
    (
      'charger',
      'Toova pick',
      ARRAY[
        'Multi-tip cable for phone and earbuds',
        'One cord instead of three',
        'Travel pouch friendly'
      ]::text[],
      NULL,
      NULL
    ),
    (
      'desk-placeholder',
      'Toova pick',
      ARRAY[
        'Place a desk from the room palette for now',
        'We are still curating retailer desk picks',
        'Measure clearance before you buy'
      ]::text[],
      'Typical dorm desk ~48″ wide',
      NULL
    )
)
UPDATE public.curated_products AS cp
SET
  brand = u.brand,
  feature_bullets = u.bullets,
  dimensions_text = u.dimensions_text,
  availability = u.availability,
  updated_at = now()
FROM updates u
WHERE cp.slug = u.prod_slug;
