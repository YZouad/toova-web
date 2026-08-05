-- Hanging decorations: stable instance keys + hanging_config JSON.
-- Run in Dashboard → SQL Editor after prior room layout migrations.
-- See also: supabase/migrations/20260805155228_hanging_decorations.sql

BEGIN;

ALTER TABLE public.room_items
  ADD COLUMN IF NOT EXISTS instance_key text,
  ADD COLUMN IF NOT EXISTS hanging_config jsonb;

UPDATE public.room_items
SET instance_key = id::text
WHERE instance_key IS NULL OR trim(instance_key) = '';

ALTER TABLE public.room_items
  ALTER COLUMN instance_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_items_room_instance_key
  ON public.room_items (room_id, instance_key);

CREATE INDEX IF NOT EXISTS idx_room_items_hanging
  ON public.room_items (room_id)
  WHERE kind = 'hanging';

COMMIT;
