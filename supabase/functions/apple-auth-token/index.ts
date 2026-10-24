import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Exchange Apple authorizationCode for a refresh token and store it for revoke-on-delete.
 * Call once after Sign in with Apple (iOS) when authorizationCode is available.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const auth = req.headers.get("Authorization");
  if (!auth) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({})) as { authorization_code?: string };
  const code = typeof body.authorization_code === "string" ? body.authorization_code.trim() : "";
  if (!code) {
    return new Response(JSON.stringify({ error: "authorization_code required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const teamId = Deno.env.get("APPLE_TEAM_ID")?.trim();
  const keyId = Deno.env.get("APPLE_KEY_ID")?.trim();
  const clientId = Deno.env.get("APPLE_CLIENT_ID")?.trim()
    ?? Deno.env.get("APPSTORE_BUNDLE_ID")?.trim()
    ?? "net.toova.app";
  const privateKeyPem = Deno.env.get("APPLE_PRIVATE_KEY")?.trim();

  if (!teamId || !keyId || !privateKeyPem) {
    // Soft success so iOS can ship before Apple secrets are configured.
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
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

    const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });
    const tokenJson = await tokenRes.json() as { refresh_token?: string; error?: string };
    if (!tokenRes.ok || !tokenJson.refresh_token) {
      console.error("apple token exchange", tokenRes.status, tokenJson);
      return new Response(JSON.stringify({ error: "apple_token_exchange_failed" }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await service.rpc("upsert_apple_auth_token", {
      p_uid: userData.user.id,
      p_refresh_token: tokenJson.refresh_token,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("apple-auth-token", err);
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
