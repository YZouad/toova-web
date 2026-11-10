-- Checklist social inspo clips (Instagram Reels & TikTok links per checklist category).

CREATE TABLE IF NOT EXISTS public.checklist_inspo_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.checklist_categories (id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.curated_products (id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('instagram', 'tiktok')),
  canonical_url text NOT NULL,
  title text NOT NULL DEFAULT '',
  creator_handle text,
  thumbnail_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  submitted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (category_id, canonical_url)
);

CREATE INDEX IF NOT EXISTS idx_checklist_inspo_clips_category_status
  ON public.checklist_inspo_clips (category_id, status, created_at DESC);

ALTER TABLE public.checklist_inspo_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_inspo_clips_public_read ON public.checklist_inspo_clips;
CREATE POLICY checklist_inspo_clips_public_read ON public.checklist_inspo_clips
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    OR (submitted_by IS NOT NULL AND submitted_by = (SELECT auth.uid()))
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS checklist_inspo_clips_user_insert ON public.checklist_inspo_clips;
CREATE POLICY checklist_inspo_clips_user_insert ON public.checklist_inspo_clips
  FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by = (SELECT auth.uid())
    AND (status = 'pending' OR public.is_admin((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS checklist_inspo_clips_admin_write ON public.checklist_inspo_clips;
CREATE POLICY checklist_inspo_clips_admin_write ON public.checklist_inspo_clips
  FOR ALL
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

GRANT SELECT ON TABLE public.checklist_inspo_clips TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.checklist_inspo_clips TO authenticated;
