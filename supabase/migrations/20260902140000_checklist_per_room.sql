-- Scope checklist progress, shopping list, and move-in budget per dorm room.

ALTER TABLE public.user_checklist_progress
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms (id) ON DELETE CASCADE;

ALTER TABLE public.user_shopping_list
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms (id) ON DELETE CASCADE;

ALTER TABLE public.user_move_in_budget
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms (id) ON DELETE CASCADE;

-- Assign legacy user-global rows to each user's oldest room.
UPDATE public.user_checklist_progress ucp
SET room_id = sub.room_id
FROM (
  SELECT DISTINCT ON (r.user_id)
    r.user_id,
    r.id AS room_id
  FROM public.rooms r
  ORDER BY r.user_id, r.created_at ASC, r.id ASC
) sub
WHERE ucp.user_id = sub.user_id
  AND ucp.room_id IS NULL;

UPDATE public.user_shopping_list usl
SET room_id = sub.room_id
FROM (
  SELECT DISTINCT ON (r.user_id)
    r.user_id,
    r.id AS room_id
  FROM public.rooms r
  ORDER BY r.user_id, r.created_at ASC, r.id ASC
) sub
WHERE usl.user_id = sub.user_id
  AND usl.room_id IS NULL;

UPDATE public.user_move_in_budget umb
SET room_id = sub.room_id
FROM (
  SELECT DISTINCT ON (r.user_id)
    r.user_id,
    r.id AS room_id
  FROM public.rooms r
  ORDER BY r.user_id, r.created_at ASC, r.id ASC
) sub
WHERE umb.user_id = sub.user_id
  AND umb.room_id IS NULL;

DELETE FROM public.user_checklist_progress WHERE room_id IS NULL;
DELETE FROM public.user_shopping_list WHERE room_id IS NULL;
DELETE FROM public.user_move_in_budget WHERE room_id IS NULL;

ALTER TABLE public.user_checklist_progress
  DROP CONSTRAINT IF EXISTS user_checklist_progress_pkey;

ALTER TABLE public.user_checklist_progress
  ADD PRIMARY KEY (user_id, room_id, category_id);

ALTER TABLE public.user_checklist_progress
  ALTER COLUMN room_id SET NOT NULL;

ALTER TABLE public.user_shopping_list
  DROP CONSTRAINT IF EXISTS user_shopping_list_pkey;

ALTER TABLE public.user_shopping_list
  ADD PRIMARY KEY (user_id, room_id, product_id);

ALTER TABLE public.user_shopping_list
  ALTER COLUMN room_id SET NOT NULL;

ALTER TABLE public.user_move_in_budget
  DROP CONSTRAINT IF EXISTS user_move_in_budget_pkey;

ALTER TABLE public.user_move_in_budget
  ADD PRIMARY KEY (user_id, room_id);

ALTER TABLE public.user_move_in_budget
  ALTER COLUMN room_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_checklist_progress_room
  ON public.user_checklist_progress (user_id, room_id);

CREATE INDEX IF NOT EXISTS idx_user_shopping_list_room
  ON public.user_shopping_list (user_id, room_id);

CREATE INDEX IF NOT EXISTS idx_user_move_in_budget_room
  ON public.user_move_in_budget (user_id, room_id);
