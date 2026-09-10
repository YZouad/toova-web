-- Admin-editable overrides for the hardcoded starter rooms shown in the
-- new-room picker. Public read so guests see the latest layout; writes are
-- limited to is_admin().

CREATE TABLE IF NOT EXISTS public.room_starter_overrides (
  template_id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

ALTER TABLE public.room_starter_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_starter_overrides_read ON public.room_starter_overrides;
CREATE POLICY room_starter_overrides_read ON public.room_starter_overrides
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS room_starter_overrides_admin_write ON public.room_starter_overrides;
DROP POLICY IF EXISTS room_starter_overrides_admin_insert ON public.room_starter_overrides;
CREATE POLICY room_starter_overrides_admin_insert ON public.room_starter_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS room_starter_overrides_admin_update ON public.room_starter_overrides;
CREATE POLICY room_starter_overrides_admin_update ON public.room_starter_overrides
  FOR UPDATE
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS room_starter_overrides_admin_delete ON public.room_starter_overrides;
CREATE POLICY room_starter_overrides_admin_delete ON public.room_starter_overrides
  FOR DELETE
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

CREATE INDEX IF NOT EXISTS idx_room_starter_overrides_updated_by
  ON public.room_starter_overrides (updated_by);

GRANT SELECT ON TABLE public.room_starter_overrides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.room_starter_overrides TO authenticated;

COMMENT ON TABLE public.room_starter_overrides IS
  'Admin edits to pre-made starter rooms (label, furniture, appearance). Merged over code defaults on the client.';
