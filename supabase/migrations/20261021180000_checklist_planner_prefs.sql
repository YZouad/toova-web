-- Checklist planner prefs: per-category stars and per-room area/tier.

ALTER TABLE public.user_checklist_progress
  ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.user_checklist_room_prefs (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  area_tag text,
  tier text NOT NULL DEFAULT 'balanced'
    CHECK (tier IN ('essentials', 'balanced', 'splurge')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);

ALTER TABLE public.user_checklist_room_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_checklist_room_prefs_owner ON public.user_checklist_room_prefs;
CREATE POLICY user_checklist_room_prefs_owner ON public.user_checklist_room_prefs
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_checklist_room_prefs TO authenticated;

CREATE INDEX IF NOT EXISTS idx_user_checklist_room_prefs_room
  ON public.user_checklist_room_prefs (user_id, room_id);
