-- Persist GLB location for placed imported items (storage path or absolute URL).
-- Run in Supabase SQL Editor.

ALTER TABLE public.room_items
  ADD COLUMN IF NOT EXISTS model_url text;
