import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";
import { stripeRequest } from "../_shared/stripeBilling.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STORAGE_REMOVE_BATCH = 100;

async function revokeAppleRefreshToken(refreshToken: string): Promise<void> {
  const teamId = Deno.env.get("APPLE_TEAM_ID")?.trim();
  const keyId = Deno.env.get("APPLE_KEY_ID")?.trim();
  const clientId = Deno.env.get("APPLE_CLIENT_ID")?.trim() // Services ID or bundle id
    ?? Deno.env.get("APPSTORE_BUNDLE_ID")?.trim()
    ?? "net.toova.app";
  const privateKeyPem = Deno.env.get("APPLE_PRIVATE_KEY")?.trim();
  if (!teamId || !keyId || !privateKeyPem) {
    console.warn("delete-account: Apple revoke skipped (missing APPLE_TEAM_ID/KEY_ID/PRIVATE_KEY)");
    return;
  }

  const key = await importPKCS8(
    privateKeyPem.includes("BEGIN")
      ? privateKeyPem
      : `-----BEGIN PRIVATE KEY-----\n${privateKeyPem}\n-----END PRIVATE KEY-----`,
    "ES256",
  );
  const clientSecret = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience("https://appleid.apple.com")
    .setSubject(clientId)
    .sign(key);

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    token: refreshToken,
    token_type_hint: "refresh_token",
  });

  const res = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Apple revoke failed", res.status, text);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

class LegalHoldError extends Error {}

async function deleteStripeCustomer(service: SupabaseClient, userId: string): Promise<void> {
  const { data } = await service
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  const customerId = (data as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (!customerId) return;
  // Deleting the customer also cancels its active subscriptions.
  await stripeRequest(`/customers/${encodeURIComponent(customerId)}`, { method: "DELETE" });
}

async function deleteStorageObjects(service: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await service.rpc("list_user_storage_objects", { p_uid: userId });
  if (error) throw new Error(`list_user_storage_objects: ${error.message}`);
  const byBucket = new Map<string, string[]>();
  for (const row of (data ?? []) as Array<{ bucket_id: string; name: string }>) {
    const list = byBucket.get(row.bucket_id) ?? [];
    list.push(row.name);
    byBucket.set(row.bucket_id, list);
  }
  let removed = 0;
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += STORAGE_REMOVE_BATCH) {
      const batch = names.slice(i, i + STORAGE_REMOVE_BATCH);
      const { error: rmErr } = await service.storage.from(bucket).remove(batch);
      if (rmErr) throw new Error(`storage remove ${bucket}: ${rmErr.message}`);
      removed += batch.length;
    }
  }
  return removed;
}

async function purgeR2Mirror(userId: string): Promise<void> {
  const base = (Deno.env.get("STORAGE_WORKER_URL")?.trim() || "https://storage.toova.net").replace(/\/+$/, "");
  const secret = Deno.env.get("ACCOUNT_PURGE_SECRET")?.trim();
  if (!secret) {
    console.error("delete-account: ACCOUNT_PURGE_SECRET unset — public R2 mirror NOT purged", userId);
    return;
  }
  const res = await fetch(`${base}/v1/purge-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(`R2 purge failed: ${res.status}`);
}

/**
 * Erase an account: Apple token, Stripe customer, Storage objects, the public
 * R2 mirror, then the auth user (DB rows cascade from auth.users).
 */
async function deleteUserCompletely(service: SupabaseClient, userId: string): Promise<void> {
  const { data: held, error: holdErr } = await service.rpc("user_has_legal_hold", { p_uid: userId });
  if (holdErr) throw new Error(`user_has_legal_hold: ${holdErr.message}`);
  if (held === true) throw new LegalHoldError("legal_hold");

  try {
    const { data: token } = await service.rpc("take_apple_auth_token", { p_uid: userId });
    if (typeof token === "string" && token.length > 0) {
      await revokeAppleRefreshToken(token);
    }
  } catch (err) {
    console.error("take/revoke apple token", err);
  }

  try {
    await deleteStripeCustomer(service, userId);
  } catch (err) {
    console.error("delete stripe customer", err);
  }

  await deleteStorageObjects(service, userId);
  await purgeR2Mirror(userId);

  const { error: delErr } = await service.auth.admin.deleteUser(userId);
  if (delErr && !/not.?found/i.test(delErr.message ?? "")) {
    throw new Error(`deleteUser: ${delErr.message}`);
  }
}

async function runUnderageSweep(service: SupabaseClient): Promise<Response> {
  const { data, error } = await service.rpc("pending_underage_cleanups", { p_limit: 50 });
  if (error) return jsonResponse({ error: "sweep_list_failed" }, 500);
  let cleaned = 0;
  let failed = 0;
  for (const userId of (data ?? []) as string[]) {
    try {
      await deleteUserCompletely(service, userId);
      await service.rpc("mark_underage_cleaned", { p_uid: userId });
      cleaned++;
    } catch (err) {
      console.error("underage sweep", userId, err instanceof Error ? err.message : err);
      failed++;
    }
  }
  return jsonResponse({ ok: true, cleaned, failed });
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cleanupHeader = req.headers.get("x-cleanup-secret")?.trim();
  if (cleanupHeader) {
    const { data: expected } = await service.rpc("account_cleanup_secret");
    if (typeof expected !== "string" || expected.length < 16 || !timingSafeEqual(cleanupHeader, expected)) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    return await runUnderageSweep(service);
  }

  const auth = req.headers.get("Authorization");
  if (!auth) return jsonResponse({ error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "unauthorized" }, 401);

  const userId = userData.user.id;
  try {
    await deleteUserCompletely(service, userId);
    await service.rpc("mark_underage_cleaned", { p_uid: userId });
  } catch (err) {
    if (err instanceof LegalHoldError) {
      return jsonResponse({
        error: "legal_hold",
        message: "This account can't be deleted right now. Contact ag@toova.net.",
      }, 409);
    }
    console.error("delete-account", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "delete_failed" }, 500);
  }

  return jsonResponse({ ok: true });
});
