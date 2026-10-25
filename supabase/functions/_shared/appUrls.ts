/** Trusted-origin URL helpers for Checkout/Portal redirects (Deno + Vitest). */

const DEFAULT_ALLOWED_ORIGINS = [
  "https://toova.net",
  "https://www.toova.net",
];

function defaultEnvGet(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get?: (k: string) => string | undefined } } }).Deno;
  return deno?.env?.get?.(name);
}

/** Origins allowed for Stripe success/cancel/return URLs. Never trust request Origin alone. */
export function allowedAppOrigins(
  envGet: (name: string) => string | undefined = defaultEnvGet,
): string[] {
  const fromEnv = envGet("BILLING_ALLOWED_ORIGINS")?.trim();
  const extras = fromEnv
    ? fromEnv.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const merged = [...DEFAULT_ALLOWED_ORIGINS, ...extras];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of merged) {
    try {
      const origin = new URL(raw).origin;
      if (!seen.has(origin)) {
        seen.add(origin);
        out.push(origin);
      }
    } catch {
      // ignore malformed allowlist entries
    }
  }
  return out;
}

export function canonicalAppOrigin(
  envGet: (name: string) => string | undefined = defaultEnvGet,
): string {
  const configured = envGet("BILLING_APP_ORIGIN")?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through
    }
  }
  return "https://toova.net";
}

/**
 * Accept only http(s) URLs whose origin is in the allowlist.
 * Rejects credentials, opaque paths, and cross-origin URLs.
 */
export function sameOriginAppUrl(
  raw: unknown,
  allowedOrigins: string[],
): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (!allowedOrigins.includes(url.origin)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function withCheckoutFlag(raw: string, flag: "success" | "cancel"): string {
  const url = new URL(raw);
  url.searchParams.set("checkout", flag);
  return url.toString();
}

/** Resolve a safe return/success/cancel URL for Stripe-hosted pages. */
export function resolveBillingReturnUrl(
  candidate: unknown,
  envGet: (name: string) => string | undefined = defaultEnvGet,
): string {
  const allowed = allowedAppOrigins(envGet);
  const safe = sameOriginAppUrl(candidate, allowed);
  if (safe) return safe;
  return `${canonicalAppOrigin(envGet)}/`;
}
