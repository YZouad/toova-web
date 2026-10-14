/** Marks that the next app load after auth should route past the marketing page. */
const POST_AUTH_REDIRECT_KEY = 'toova-post-auth-redirect';
const TTL_MS = 60 * 60 * 1000; // 1 hour — long enough for email confirm in a new tab

export function markPostAuthRedirect(): void {
  try {
    localStorage.setItem(POST_AUTH_REDIRECT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Returns true once if a fresh marker exists, then clears it. */
export function consumePostAuthRedirect(): boolean {
  try {
    const raw = localStorage.getItem(POST_AUTH_REDIRECT_KEY);
    localStorage.removeItem(POST_AUTH_REDIRECT_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < TTL_MS;
  } catch {
    return false;
  }
}
