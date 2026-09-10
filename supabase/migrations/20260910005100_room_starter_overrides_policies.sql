-- Tighten starter-override write policies (no overlapping SELECT) and
-- index the updated_by foreign key.

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
