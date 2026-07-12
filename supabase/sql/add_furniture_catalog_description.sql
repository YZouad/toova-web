-- Optional description + user-owned custom catalog rows.
-- Run after room_layout_schema.sql / furniture_catalog_tags.sql.

BEGIN;

ALTER TABLE public.furniture_catalog
  ADD COLUMN IF NOT EXISTS description text;

-- NULL for built-in rows; set for user uploads.
ALTER TABLE public.furniture_catalog
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

-- Built-in seeds keep user_id NULL.

DROP POLICY IF EXISTS catalog_read ON public.furniture_catalog;

-- Authenticated users see built-ins and their own uploads.
CREATE POLICY catalog_select ON public.furniture_catalog FOR SELECT
  TO authenticated
  USING (
    is_builtin = true
    OR user_id = (select auth.uid())
  );

CREATE POLICY catalog_user_insert ON public.furniture_catalog FOR INSERT
  TO authenticated
  WITH CHECK (
    is_builtin = false
    AND user_id = (select auth.uid())
    AND (select auth.uid()) IS NOT NULL
  );

GRANT INSERT ON public.furniture_catalog TO authenticated;

COMMIT;
