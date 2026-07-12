-- Phase 3: environment, room geometry, and per-item emitter columns.
-- Run in Supabase SQL Editor (Dashboard → SQL) on the project used by 3DVisSim.

BEGIN;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS environment jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS room_geometry jsonb DEFAULT NULL;

ALTER TABLE public.room_items
  ADD COLUMN IF NOT EXISTS emitter jsonb DEFAULT NULL;

COMMIT;
