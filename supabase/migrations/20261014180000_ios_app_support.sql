-- iOS app: room scan jobs, push tokens, App Store purchase idempotency
-- (credit_costs insert removed — that table uses operation/cost, not code/display_name/active)

CREATE TABLE IF NOT EXISTS public.room_scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  scan_id text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  error text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_scan_jobs_user_id_idx ON public.room_scan_jobs (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS room_scan_jobs_user_scan_idx ON public.room_scan_jobs (user_id, scan_id);

ALTER TABLE public.room_scan_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_scan_jobs_select_own ON public.room_scan_jobs;
CREATE POLICY room_scan_jobs_select_own ON public.room_scan_jobs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS room_scan_jobs_insert_own ON public.room_scan_jobs;
CREATE POLICY room_scan_jobs_insert_own ON public.room_scan_jobs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'ios',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_push_tokens_own ON public.device_push_tokens;
CREATE POLICY device_push_tokens_own ON public.device_push_tokens
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.appstore_transactions (
  transaction_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id text NOT NULL,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb
);

ALTER TABLE public.appstore_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appstore_transactions_select_own ON public.appstore_transactions;
CREATE POLICY appstore_transactions_select_own ON public.appstore_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Optional room-scan credit cost (table uses operation/cost; cost must be > 0).
-- Room scan currently costs 0 in product — skip seed until a positive cost is defined.
