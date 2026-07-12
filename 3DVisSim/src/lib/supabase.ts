import { createClient } from '@supabase/supabase-js';

// These are public/safe — Supabase anon keys are intentionally exposed in the client.
// They only grant access controlled by Row-Level Security policies.
const SUPABASE_URL = 'https://xfifgtedssabneqlxbhf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_BKydIgobs2Vj7Wf-PNCl_w_FUm4y2xv';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
