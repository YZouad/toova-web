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
  const data = await res.json() as { id?: string };
  if (!data.id) throw new HttpError(401, "Invalid or expired session.");
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

export async function recordStripeEvent(eventId: string, eventType: string): Promise<boolean> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireServiceKey();
  const res = await fetch(`${supabaseUrl}/rest/v1/stripe_events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ event_id: eventId, event_type: eventType }),
  });
  if (res.status === 409) return false;
  if (!res.ok) {
    const text = await res.text();
    console.error("stripe_events insert", text);
    return false;
  }
  return true;
}
