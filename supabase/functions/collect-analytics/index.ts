/**
 * Batch-collect consented first-party analytics events.
 * verify_jwt = false — function verifies JWT when present and derives user_id.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  MAX_BATCH,
  RATE_LIMIT_PER_MINUTE,
  prepareCollectBatch,
} from "./policy.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    let userId: string | null = null;
    if (authHeader.toLowerCase().startsWith("bearer ") && authHeader.length > 20) {
      const userClient = createClient(supabaseUrl, requireEnv("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      userId = userData.user?.id ?? null;
    }

    if (userId) {
      const { data: adminRow } = await admin
        .from("admins")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (adminRow?.user_id) {
        return json({ accepted: 0, skipped: "internal_user" }, 204);
      }
    }

    const body = await req.json().catch(() => null);
    const prepared = prepareCollectBatch(body, userId);
    if ("error" in prepared) {
      return json({ error: prepared.error }, prepared.status);
    }
    if (prepared.events.length === 0) {
      return json({ accepted: 0, rejected: prepared.rejected, duplicate: 0 });
    }

    const sessionId = prepared.events.find((e) => e.session_id)?.session_id ?? null;
    const since = new Date(Date.now() - 60 * 1000).toISOString();
    let recentQuery = admin
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .gte("received_at", since);
    if (userId) {
      recentQuery = recentQuery.eq("user_id", userId);
    } else if (sessionId) {
      recentQuery = recentQuery.eq("session_id", sessionId);
    }
    const { count: recent } = await recentQuery;
    if ((recent ?? 0) >= RATE_LIMIT_PER_MINUTE) {
      return json({ error: "Rate limit exceeded." }, 429);
    }
    const remaining = Math.max(0, RATE_LIMIT_PER_MINUTE - (recent ?? 0));
    const limited = prepared.events.slice(0, Math.min(remaining, MAX_BATCH));

    const { data, error } = await admin.rpc("ingest_analytics_events", {
      p_events: limited,
    });
    if (error) {
      console.error("ingest_analytics_events", error);
      return json({ error: "Ingest failed." }, 500);
    }

    return json({
      ...(typeof data === "object" && data ? data : { accepted: limited.length }),
      rejected: prepared.rejected + (prepared.events.length - limited.length),
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Unexpected error." }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
