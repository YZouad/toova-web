import { supabase } from './supabase';

/** Credits charged per Trellis photo→3D generation. Tune after metering. */
export const TRELLIS_CREDIT_COST = 1;

/** Stale held credits older than Trellis wake+generate timeout are released. */
export const CREDIT_HOLD_STALE_MS = 30 * 60 * 1000;

export async function ensurePeriodCredits(): Promise<number> {
  const { data, error } = await supabase.rpc('ensure_period_credits', {});
  if (error) {
    console.warn('[credits] ensure_period_credits failed', error.message);
    return 0;
  }
  return typeof data === 'number' ? data : Number(data) || 0;
}

export async function holdCreditsForJob(
  jobId: string,
  amount: number = TRELLIS_CREDIT_COST,
): Promise<string | null> {
  await ensurePeriodCredits();
  const { data, error } = await supabase.rpc('hold_credits', {
    p_amount: amount,
    p_idempotency_key: `trellis-hold:${jobId}`,
    p_ref: jobId,
  });
  if (error) {
    throw new Error(error.message || 'Could not hold credits.');
  }
  return typeof data === 'string' ? data : data != null ? String(data) : null;
}

export async function settleCreditsHold(holdId: string | null | undefined): Promise<void> {
  if (!holdId) return;
  const { error } = await supabase.rpc('settle_credits', { p_hold_id: holdId });
  if (error) console.warn('[credits] settle failed', error.message);
}

export async function releaseCreditsHold(holdId: string | null | undefined): Promise<void> {
  if (!holdId) return;
  const { error } = await supabase.rpc('release_credits', { p_hold_id: holdId });
  if (error) console.warn('[credits] release failed', error.message);
}

export async function recordTrellisUsage(jobId: string): Promise<void> {
  const { error } = await supabase.rpc('record_usage_event', {
    p_meter_key: 'trellis_generate',
    p_quantity: 1,
    p_ref: jobId,
    p_metadata: { source: 'trellis' },
  });
  if (error) console.warn('[usage] record failed', error.message);
}

let sweeperStarted = false;

/** Release holds stranded by crashed generations (best-effort, service RPC via user JWT not available — call periodically from signed-in clients is a no-op for others' holds; BFF cron preferred). */
export function startCreditHoldSweeper(): void {
  if (sweeperStarted || typeof window === 'undefined') return;
  sweeperStarted = true;
  // Client cannot call release_stale_credit_holds (service-only). Local cleanup is per-job release on fail.
}
