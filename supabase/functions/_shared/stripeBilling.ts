export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function requireEnv(name: string): string {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export function requireServiceKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

type JwtClaims = {
  sub?: string;
  role?: string;
  exp?: number;
};

/**
 * Decode Supabase access JWT claims without verifying the signature.
 * Do not use for authorization — prefer requireUserId / auth.getUser.
 */
export function decodeAccessJwtClaims(token: string): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as JwtClaims;
  } catch {
    return null;
  }
}

/**
 * Resolve the caller user id by verifying the access JWT with Supabase Auth.
 * Never trusts base64-decoded claims alone.
 */
export async function requireUserId(req: Request): Promise<string> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Missing Authorization header.");

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new HttpError(401, "Invalid or expired session.");
  const data = await res.json() as { id?: string; role?: string };
  if (!data.id) throw new HttpError(401, "Invalid or expired session.");

  // Auth API already verified the signature; still require an authenticated user.
  const claims = decodeAccessJwtClaims(token);
  if (claims?.role && claims.role !== "authenticated") {
    throw new HttpError(401, "Invalid or expired session.");
  }
  return data.id;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export async function stripeRequest(
  path: string,
  init: RequestInit & { params?: Record<string, string> },
): Promise<unknown> {
  const secret = requireEnv("STRIPE_SECRET_KEY");
  const url = new URL(`https://api.stripe.com/v1${path}`);
  if (init.params) {
    for (const [k, v] of Object.entries(init.params)) {
      url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
  };
  if (init.body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const res = await fetch(url.toString(), {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers,
    body: init.body,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("Stripe error", res.status, text);
    throw new HttpError(502, "Stripe request failed.");
  }
  return text ? JSON.parse(text) : {};
}

export function formBody(entries: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export async function restRpc(
  rpc: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireServiceKey();
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${rpc} failed: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function restUpsert(
  table: string,
  row: Record<string, unknown>,
  onConflict: string,
): Promise<void> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireServiceKey();
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
      Prefer: `resolution=merge-duplicates,return=minimal`,
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${table} upsert failed: ${text}`);
  }
}

export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireServiceKey();

  const existing = await fetch(
    `${supabaseUrl}/rest/v1/billing_customers?user_id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    },
  );
  if (existing.ok) {
    const rows = await existing.json() as Array<{ stripe_customer_id?: string }>;
    const id = rows[0]?.stripe_customer_id?.trim();
    if (id) return id;
  }

  const customer = await stripeRequest("/customers", {
    method: "POST",
    body: formBody({
      "metadata[user_id]": userId,
    }),
  }) as { id?: string };

  const customerId = customer.id;
  if (!customerId) throw new Error("Stripe customer missing id");

  await restUpsert("billing_customers", {
    user_id: userId,
    stripe_customer_id: customerId,
    updated_at: new Date().toISOString(),
  }, "user_id");

  return customerId;
}

export async function fetchPlanPriceId(tier: string, interval: "monthly" | "yearly"): Promise<string | null> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireServiceKey();
  const col = interval === "yearly" ? "stripe_price_id_yearly" : "stripe_price_id_monthly";
  const res = await fetch(
    `${supabaseUrl}/rest/v1/plans?tier=eq.${encodeURIComponent(tier)}&select=${col}`,
    { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
  );
  if (!res.ok) return null;
  const rows = await res.json() as Array<Record<string, string | null>>;
  const price = rows[0]?.[col];
  return typeof price === "string" && price.trim() ? price.trim() : null;
}

/** Returns subscription.source when the user has an active (or trialing, non-expired) plan. */
export async function fetchActiveSubscriptionSource(
  userId: string,
): Promise<string | null> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireServiceKey();
  const res = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=source,status,current_period_end`,
    { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
  );
  if (!res.ok) return null;
  const rows = await res.json() as Array<{
    source?: string;
    status?: string;
    current_period_end?: string | null;
  }>;
  const row = rows[0];
  if (!row?.source) return null;
  if (row.status !== "active" && row.status !== "trialing") return null;
  if (row.current_period_end) {
    const end = Date.parse(row.current_period_end);
    if (Number.isFinite(end) && end <= Date.now()) return null;
  }
  return row.source;
}

export async function fetchBillingProduct(sku: string): Promise<{
  sku: string;
  kind: string;
  credits_amount: number | null;
  grant_tier: string | null;
  grant_months: number | null;
  stripe_price_id: string | null;
} | null> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireServiceKey();
  const res = await fetch(
    `${supabaseUrl}/rest/v1/billing_products?sku=eq.${encodeURIComponent(sku)}&select=sku,kind,credits_amount,grant_tier,grant_months,stripe_price_id`,
    { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
  );
  if (!res.ok) return null;
  const rows = await res.json() as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    sku: String(row.sku),
    kind: String(row.kind),
    credits_amount: typeof row.credits_amount === "number" ? row.credits_amount : null,
    grant_tier: typeof row.grant_tier === "string" ? row.grant_tier : null,
    grant_months: typeof row.grant_months === "number" ? row.grant_months : null,
    stripe_price_id: typeof row.stripe_price_id === "string" ? row.stripe_price_id : null,
  };
}

export type ClaimStripeEventResult = {
  ok: boolean;
  claimed?: boolean;
  duplicate?: boolean;
  in_flight?: boolean;
  retried?: boolean;
  status?: string;
  attempt_count?: number;
  error?: string;
};

/** Atomically claim a Stripe event for processing. Only processed events are skipped. */
export async function claimStripeEvent(
  eventId: string,
  eventType: string,
  staleAfterSeconds = 300,
): Promise<ClaimStripeEventResult> {
  const result = await restRpc("claim_stripe_event", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_stale_after_seconds: staleAfterSeconds,
  }) as ClaimStripeEventResult;
  if (!result || result.ok !== true) {
    throw new Error(`claim_stripe_event failed: ${JSON.stringify(result)}`);
  }
  return result;
}

export async function completeStripeEvent(eventId: string): Promise<void> {
  const result = await restRpc("complete_stripe_event", {
    p_event_id: eventId,
  }) as { ok?: boolean; error?: string };
  if (!result?.ok) {
    throw new Error(`complete_stripe_event failed: ${result?.error ?? "unknown"}`);
  }
}

export async function failStripeEvent(eventId: string, errorMessage: string): Promise<void> {
  try {
    await restRpc("fail_stripe_event", {
      p_event_id: eventId,
      p_error: errorMessage.slice(0, 2000),
    });
  } catch (err) {
    console.error("fail_stripe_event", err);
  }
}
