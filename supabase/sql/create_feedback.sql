-- Feedback / bug reports from landing, dashboard, designer, and contact page.
-- Run in Supabase SQL Editor or via migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  email text,
  message text NOT NULL,
  category text NOT NULL DEFAULT 'bug',
  page_source text NOT NULL,
  user_agent text,
  CONSTRAINT feedback_category_check CHECK (category IN ('bug', 'feedback', 'other')),
  CONSTRAINT feedback_message_nonempty CHECK (char_length(trim(message)) > 0)
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Anyone can submit feedback (including anonymous landing visitors).
CREATE POLICY feedback_insert ON public.feedback
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- No client read/update/delete — team reviews in Supabase dashboard.

GRANT INSERT ON public.feedback TO anon, authenticated;

COMMIT;
