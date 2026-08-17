-- Modular bedding configuration for builtin Twin Bed items.
ALTER TABLE public.room_items
  ADD COLUMN IF NOT EXISTS bedding_config jsonb;
