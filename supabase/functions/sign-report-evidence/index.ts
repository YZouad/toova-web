/**
 * Admin-only: mint short-lived signed URLs for report evidence media.
 * Body: { report_id: string }
 * verify_jwt = true
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL_SEC = 120;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ") || auth.length < 20) {
      return json({ error: "Unauthorized." }, 401);
    }

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Unauthorized." }, 401);
    }

    const { data: adminRow } = await userClient
      .from("admins")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!adminRow) {
      return json({ error: "Forbidden." }, 403);
    }

    const body = await req.json().catch(() => null) as { report_id?: string } | null;
    const reportId = body?.report_id?.trim();
    if (!reportId) return json({ error: "report_id required." }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: report, error: repErr } = await admin
      .from("content_reports")
      .select("id, target_type, target_id, evidence")
      .eq("id", reportId)
      .maybeSingle();

    if (repErr || !report) {
      return json({ error: "Not found." }, 404);
    }

    const evidence = (report.evidence ?? {}) as Record<string, unknown>;
    const urls: Record<string, string | null> = {};

    const thumb = typeof evidence.thumbnail_path === "string" ? evidence.thumbnail_path : null;
    const avatar = typeof evidence.avatar_path === "string" ? evidence.avatar_path : null;
    const modelUrl = typeof evidence.model_url === "string" ? evidence.model_url : null;

    if (thumb) {
      urls.thumbnail = await signPath(admin, guessBucket(thumb, "model-files"), thumb);
    }
    if (avatar) {
      urls.avatar = await signPath(admin, "profile-avatars", avatar);
    }
    if (modelUrl && !modelUrl.startsWith("http")) {
      urls.model = await signPath(admin, "model-files", modelUrl);
    } else if (modelUrl) {
      urls.model = modelUrl;
    }

    return json({
      ok: true,
      report_id: report.id,
      target_type: report.target_type,
      target_id: report.target_id,
      urls,
      evidence,
    });
  } catch (error) {
    console.error(error);
    return json(
      { error: error instanceof Error ? error.message : "Sign failed." },
      500,
    );
  }
});

function guessBucket(path: string, fallback: string): string {
  if (path.startsWith("room-thumbnails/") || path.includes("/room-thumbnails/")) {
    return "room-thumbnails";
  }
  if (path.startsWith("profile-avatars/")) return "profile-avatars";
  return fallback;
}

async function signPath(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
): Promise<string | null> {
  const clean = path.replace(/^\/+/, "");
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(clean, SIGN_TTL_SEC);
  if (error) {
    console.error("sign failed", bucket, clean, error.message);
    return null;
  }
  return data.signedUrl;
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
