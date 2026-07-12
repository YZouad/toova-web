-- Bedding metadata for builtin Twin Bed items (pattern texture path + colors).
-- Run in Supabase SQL Editor after room_items exists.

ALTER TABLE public.room_items
  ADD COLUMN IF NOT EXISTS bedding_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blanket_color text,
  ADD COLUMN IF NOT EXISTS blanket_texture_path text;
