-- Per-category have/skip resolution and user move-in budget cap.

ALTER TABLE public.user_checklist_progress
  ADD COLUMN IF NOT EXISTS resolution text;

ALTER TABLE public.user_checklist_progress
  DROP CONSTRAINT IF EXISTS user_checklist_progress_resolution_chk;

ALTER TABLE public.user_checklist_progress
  ADD CONSTRAINT user_checklist_progress_resolution_chk
  CHECK (resolution IS NULL OR resolution IN ('have', 'skip'));

CREATE TABLE IF NOT EXISTS public.user_move_in_budget (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  budget_cents integer NOT NULL CHECK (budget_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

ALTER TABLE public.user_move_in_budget ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_move_in_budget_owner ON public.user_move_in_budget;
CREATE POLICY user_move_in_budget_owner ON public.user_move_in_budget
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_move_in_budget TO authenticated;
