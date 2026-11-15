-- Room vs manual shopping-list provenance, custom lists, wipe legacy rows, iOS-compat trigger.

ALTER TABLE public.user_shopping_list
  ADD COLUMN IF NOT EXISTS room_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_quantity integer NOT NULL DEFAULT 0;

ALTER TABLE public.user_shopping_list
  DROP CONSTRAINT IF EXISTS user_shopping_list_qty_chk;

ALTER TABLE public.user_shopping_list
  ADD CONSTRAINT user_shopping_list_room_qty_chk CHECK (room_quantity >= 0),
  ADD CONSTRAINT user_shopping_list_manual_qty_chk CHECK (manual_quantity >= 0),
  ADD CONSTRAINT user_shopping_list_qty_chk CHECK (quantity > 0),
  ADD CONSTRAINT user_shopping_list_has_qty_chk CHECK (room_quantity > 0 OR manual_quantity > 0);

-- Reset all room shopping lists; clients rebuild room_quantity from room_items.
DELETE FROM public.user_shopping_list;

CREATE OR REPLACE FUNCTION public.user_shopping_list_sync_quantities()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF COALESCE(NEW.room_quantity, 0) = 0 AND COALESCE(NEW.manual_quantity, 0) = 0 AND NEW.quantity > 0 THEN
    NEW.manual_quantity := NEW.quantity;
  END IF;
  NEW.quantity := GREATEST(COALESCE(NEW.room_quantity, 0), COALESCE(NEW.manual_quantity, 0));
  IF NEW.quantity <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_shopping_list_sync_quantities_trg ON public.user_shopping_list;
CREATE TRIGGER user_shopping_list_sync_quantities_trg
  BEFORE INSERT OR UPDATE ON public.user_shopping_list
  FOR EACH ROW
  EXECUTE FUNCTION public.user_shopping_list_sync_quantities();

-- Account-backed custom checklists (independent of rooms).
CREATE TABLE IF NOT EXISTS public.user_custom_checklist_lists (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_custom_checklist_lists_name_chk CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_user_custom_checklist_lists_user
  ON public.user_custom_checklist_lists (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.user_custom_checklist_items (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  list_id text NOT NULL REFERENCES public.user_custom_checklist_lists (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.curated_products (id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  review_done boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, product_id),
  CONSTRAINT user_custom_checklist_items_qty_chk CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_user_custom_checklist_items_user
  ON public.user_custom_checklist_items (user_id, list_id);

ALTER TABLE public.user_custom_checklist_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_custom_checklist_lists_owner ON public.user_custom_checklist_lists;
CREATE POLICY user_custom_checklist_lists_owner ON public.user_custom_checklist_lists
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_custom_checklist_items_owner ON public.user_custom_checklist_items;
CREATE POLICY user_custom_checklist_items_owner ON public.user_custom_checklist_items
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_custom_checklist_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_custom_checklist_items TO authenticated;