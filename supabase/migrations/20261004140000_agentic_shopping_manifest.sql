-- History reconciliation: matches remote 20261004140000_agentic_shopping_manifest.
-- Minimal recreate so local resets still get the shopping-items table.

CREATE TABLE IF NOT EXISTS public.user_agentic_shopping_items (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  room_id uuid NOT NULL,
  id text NOT NULL,
  query text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  estimated_cents int,
  placed_in_room boolean NOT NULL DEFAULT false,
  bank_poster_label text,
  catalog_product_id uuid,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id, id)
);

ALTER TABLE public.user_agentic_shopping_items ENABLE ROW LEVEL SECURITY;
