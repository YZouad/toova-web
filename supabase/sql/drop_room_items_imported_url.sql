-- Remove `imported_url` from `room_items` (URLs are not persisted; use Storage/tags later).
-- Run in Supabase SQL Editor if your project still has this column.

ALTER TABLE public.room_items DROP COLUMN IF EXISTS imported_url;
