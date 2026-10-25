-- Room scan placeholders: link room_items to RoomPlan objects and track AI replacement.

ALTER TABLE public.room_items
  ADD COLUMN IF NOT EXISTS scan_object_id text,
  ADD COLUMN IF NOT EXISTS scan_status text;

ALTER TABLE public.room_items
  DROP CONSTRAINT IF EXISTS room_items_scan_status_chk;

ALTER TABLE public.room_items
  ADD CONSTRAINT room_items_scan_status_chk CHECK (
    scan_status IS NULL
    OR scan_status = ANY (
      ARRAY['pending', 'matching', 'generating', 'done', 'failed']::text[]
    )
  );

CREATE INDEX IF NOT EXISTS idx_room_items_scan_object
  ON public.room_items (room_id, scan_object_id)
  WHERE scan_object_id IS NOT NULL;

ALTER TABLE public.room_scan_jobs
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS room_scan_jobs_room_id_idx ON public.room_scan_jobs (room_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'room_scan_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_scan_jobs;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'room_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_items;
  END IF;
END $$;
