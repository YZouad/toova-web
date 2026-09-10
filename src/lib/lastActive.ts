import { supabase } from './supabase';

const MIN_INTERVAL_MS = 60_000;
const HEARTBEAT_MS = 5 * 60_000;

let lastTouchAt = 0;
let inFlight = false;

/** Stamp the signed-in user's last_active_at (server also throttles to 45s). */
export async function touchLastActive(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastTouchAt < MIN_INTERVAL_MS) return;
  if (inFlight) return;
  inFlight = true;
  lastTouchAt = now;
  try {
    const { error } = await supabase.rpc('touch_own_last_active');
    if (error) lastTouchAt = 0;
  } catch {
    lastTouchAt = 0;
  } finally {
    inFlight = false;
  }
}

/** Ping on session start, tab focus, and every 5 minutes while visible. */
export function startLastActiveHeartbeat(): () => void {
  const ping = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void touchLastActive();
  };

  ping();
  document.addEventListener('visibilitychange', ping);
  window.addEventListener('focus', ping);
  const timer = window.setInterval(ping, HEARTBEAT_MS);

  return () => {
    document.removeEventListener('visibilitychange', ping);
    window.removeEventListener('focus', ping);
    window.clearInterval(timer);
  };
}
