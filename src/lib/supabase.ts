import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// These are public/safe — Supabase anon keys are intentionally exposed in the client.
// They only grant access controlled by Row-Level Security policies.
export const SUPABASE_URL = 'https://xfifgtedssabneqlxbhf.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_BKydIgobs2Vj7Wf-PNCl_w_FUm4y2xv';

type ToovaGlobal = typeof globalThis & { __toovaSupabase?: SupabaseClient };

/**
 * Auth ops stay serialized on this client via GoTrueClient.lockAcquired.
 * Skip Navigator LockManager: auto-refresh requests the same lock with
 * timeout 0 while initialize (or another tab / a Vite HMR zombie) still
 * holds it, and the thrown LockAcquireTimeoutError is uncaught in Firefox.
 */
async function inProcessAuthLock<T>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>,
): Promise<T> {
  return await fn();
}

function createToovaClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { lock: inProcessAuthLock },
  });
}

/**
 * Reuse one client across Vite HMR so a discarded module does not keep an
 * auto-refresh timer running alongside the new client.
 */
function getToovaClient(): SupabaseClient {
  const g = globalThis as ToovaGlobal;
  if (import.meta.hot) {
    const data = import.meta.hot.data as { supabase?: SupabaseClient };
    data.supabase ??= g.__toovaSupabase ?? createToovaClient();
    g.__toovaSupabase = data.supabase;
    return data.supabase;
  }
  if (!g.__toovaSupabase) g.__toovaSupabase = createToovaClient();
  return g.__toovaSupabase;
}

export const supabase = getToovaClient();
