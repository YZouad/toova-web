-- Persist agentic room-plan shopping lines (query + search links) per room.

CREATE TABLE IF NOT EXISTS public.user_agentic_shopping_items (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  id text NOT NULL,
  query text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  estimated_cents integer,
  placed_in_room boolean NOT NULL DEFAULT false,
  bank_poster_label text,
  catalog_product_id uuid REFERENCES public.curated_products (id) ON DELETE SET NULL,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id, id),
  CONSTRAINT user_agentic_shopping_items_qty_chk CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_user_agentic_shopping_items_room
  ON public.user_agentic_shopping_items (user_id, room_id);

ALTER TABLE public.user_agentic_shopping_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_agentic_shopping_items_owner ON public.user_agentic_shopping_items;
CREATE POLICY user_agentic_shopping_items_owner ON public.user_agentic_shopping_items
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_agentic_shopping_items TO authenticated;
