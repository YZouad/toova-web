-- Room layout schema for 3DVisSim — run once in YOUR Supabase project:
-- `room_items` stores placement/size; imported GLB URLs are not persisted in the DB here.
-- Tagging: use `furniture_catalog.tags` (text[]) per product kind — not per placed row.
-- Dashboard → SQL Editor → paste → Run.
-- Confirm this project matches 3DVisSim/src/lib/supabase.ts (same URL/key pair).

BEGIN;

-- Optional: wipe previous attempt (same names only)
DROP TABLE IF EXISTS public.room_items CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
DROP TABLE IF EXISTS public.furniture_catalog CASCADE;

CREATE TABLE public.furniture_catalog (
  kind             text PRIMARY KEY,
  label            text NOT NULL,
  width_in         numeric NOT NULL,
  height_in        numeric NOT NULL,
  depth_in         numeric NOT NULL,
  clearance_in     numeric,
  is_builtin       boolean NOT NULL DEFAULT true,
  model_url        text,
  tags             text[] NOT NULL DEFAULT '{}'::text[]
);

INSERT INTO public.furniture_catalog (
  kind, label, width_in, height_in, depth_in, clearance_in, is_builtin, model_url, tags
) VALUES
  ('bed',        'Twin Bed',   38, 14, 75, 8,    true, null, '{}'::text[]),
  ('dresser',    'Dresser',    30, 32, 18, null,  true, null, '{}'::text[]),
  ('wardrobe',   'Wardrobe',   36, 72, 24, null,  true, null, '{}'::text[]),
  ('desk',       'Desk',       48, 30, 24, 28.5, true, null, '{}'::text[]),
  ('chair',      'Chair',      18, 36, 18, null,  true, null, '{}'::text[]),
  ('nightstand', 'Nightstand', 18, 24, 18, null,  true, null, '{}'::text[]);

CREATE TABLE public.rooms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT 'My Room',
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rooms_user_id ON public.rooms (user_id);
CREATE INDEX idx_rooms_user_updated ON public.rooms (user_id, updated_at DESC);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY rooms_owner ON public.rooms FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE TABLE public.room_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  kind            text NOT NULL,
  label           text NOT NULL,
  pos_x           numeric NOT NULL,
  pos_y           numeric NOT NULL,
  pos_z           numeric NOT NULL,
  rotation_y      numeric NOT NULL DEFAULT 0,
  size_w          numeric NOT NULL,
  size_h          numeric NOT NULL,
  size_d          numeric NOT NULL,
  bed_leg_height  numeric,
  natural_w       numeric,
  natural_h       numeric,
  natural_d       numeric,
  sort_order      int NOT NULL DEFAULT 0,
  model_url       text,
  bedding_enabled boolean NOT NULL DEFAULT false,
  blanket_color   text,
  blanket_texture_path text
);

CREATE INDEX idx_room_items_room_sort ON public.room_items (room_id, sort_order);

ALTER TABLE public.room_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY room_items_owner ON public.room_items FOR ALL
  USING (room_id IN (SELECT id FROM public.rooms WHERE user_id = (select auth.uid())))
  WITH CHECK (room_id IN (SELECT id FROM public.rooms WHERE user_id = (select auth.uid())));

ALTER TABLE public.furniture_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_read ON public.furniture_catalog FOR SELECT
  USING (auth.role() = 'authenticated'::text);

-- API access via publishable keys (authenticated JWT only for catalog mutations not needed).
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.furniture_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_items TO authenticated;

-- Prefer not exposing catalog dimensions to anon traffic.
REVOKE SELECT ON public.furniture_catalog FROM anon;

COMMIT;
