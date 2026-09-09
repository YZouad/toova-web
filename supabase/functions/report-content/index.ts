/**
 * Accept a content report (signed-in or signed-out), snapshot evidence,
 * optionally auto-quarantine CSAM / sexual content, and alert safety@.
 *
 * Secrets: RESEND_API_KEY, SAFETY_ALERT_TO (comma-separated), SAFETY_ALERT_FROM (optional),
 *          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * verify_jwt = false — function verifies JWT when present.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TARGET_TYPES = new Set([
  "catalog_model",
  "room",
  "profile",
  "avatar",
  "share",
  "other",
]);

const REASONS = new Set([
  "csam",
  "sexual_content",
  "harassment",
  "inappropriate",
  "spam",
  "stolen",
  "other",
]);

const AUTO_QUARANTINE = new Set(["csam", "sexual_content"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const body = await req.json().catch(() => null) as ReportBody | null;
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid body." }, 400);
    }

    const targetType = String(body.target_type ?? "");
    const targetId = String(body.target_id ?? "").trim();
    const reason = String(body.reason ?? "");
    const details = body.details != null ? String(body.details).trim() : "";
    const reporterEmail = body.reporter_email != null
      ? String(body.reporter_email).trim().toLowerCase()
      : "";

    if (!TARGET_TYPES.has(targetType) || !targetId) {
      return json({ error: "Invalid target." }, 400);
    }
    if (!REASONS.has(reason)) {
      return json({ error: "Invalid reason." }, 400);
    }
    if (details.length > 2000) {
      return json({ error: "Details too long." }, 400);
    }
    if (reporterEmail && (reporterEmail.length > 320 || !reporterEmail.includes("@"))) {
      return json({ error: "Invalid email." }, 400);
    }

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    let reporterId: string | null = null;
    if (authHeader.toLowerCase().startsWith("bearer ") && authHeader.length > 20) {
      const userClient = createClient(supabaseUrl, requireEnv("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      reporterId = userData.user?.id ?? null;
    }

    // Rate limit: 10/hour per user or IP fingerprint.
    const ip = req.headers.get("cf-connecting-ip")
      ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "unknown";
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    let recentQuery = admin
      .from("content_reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    if (reporterId) {
      recentQuery = recentQuery.eq("reporter_id", reporterId);
    } else {
      recentQuery = recentQuery.contains("evidence", { client_ip: ip });
    }
    const { count: recent } = await recentQuery;
    if ((recent ?? 0) >= 10) {
      return json({ error: "Rate limit exceeded. Try again later." }, 429);
    }

    const evidence = await snapshotEvidence(admin, targetType, targetId);
    evidence.client_ip = ip;
    evidence.user_agent = (req.headers.get("user-agent") ?? "").slice(0, 512);

    const ownerProfile = await loadProfile(admin, typeof evidence.owner_id === "string" ? evidence.owner_id : null);
    const reporterProfile = await loadProfile(admin, reporterId);
    if (ownerProfile) {
      evidence.owner_handle = ownerProfile.handle;
      evidence.owner_display_name = ownerProfile.display_name;
    }
    if (reporterProfile) {
      evidence.reporter_handle = reporterProfile.handle;
      evidence.reporter_display_name = reporterProfile.display_name;
    }

    if (reporterId && evidence.owner_id && reporterId === evidence.owner_id) {
      return json({ error: "Cannot report your own content." }, 400);
    }

    const { data: inserted, error: insertErr } = await admin
      .from("content_reports")
      .insert({
        reporter_id: reporterId,
        reporter_email: reporterEmail || null,
        target_type: targetType,
        target_id: targetId,
        target_owner_id: evidence.owner_id ?? null,
        reason,
        details: details || null,
        status: "new",
        evidence,
      })
      .select("id, created_at, reason, target_type, target_id")
      .single();

    if (insertErr || !inserted) {
      console.error("insert failed", insertErr);
      return json({ error: "Could not save report." }, 500);
    }

    await admin.from("report_actions").insert({
      report_id: inserted.id,
      actor_id: reporterId,
      action: "created",
      note: reporterId ? null : "anonymous report",
      metadata: { via: "report-content" },
    });

    let quarantined = false;
    if (AUTO_QUARANTINE.has(reason)) {
      if (targetType === "catalog_model") {
        const { error } = await admin.rpc("quarantine_catalog_model", {
          p_kind: targetId,
          p_reason: reason,
        });
        if (error) console.error("quarantine catalog failed", error);
        else quarantined = true;
      } else if (targetType === "room") {
        const { error } = await admin.rpc("quarantine_room", {
          p_room_id: targetId,
          p_reason: reason,
        });
        if (error) console.error("quarantine room failed", error);
        else quarantined = true;
      }
      if (quarantined) {
        await admin.from("report_actions").insert({
          report_id: inserted.id,
          actor_id: null,
          action: "quarantine",
          note: "auto-quarantine on csam/sexual_content",
        });
      }
    }

    await sendSafetyAlert({
      reportId: inserted.id,
      reason,
      targetType,
      targetId,
      targetLabel: targetLabelFromEvidence(evidence),
      quarantined,
      reporterId,
      reporterEmail: reporterEmail || null,
      reporterHandle: reporterProfile?.handle ?? null,
      reporterDisplayName: reporterProfile?.display_name ?? null,
      ownerId: typeof evidence.owner_id === "string" ? evidence.owner_id : null,
      ownerHandle: ownerProfile?.handle ?? null,
      ownerDisplayName: ownerProfile?.display_name ?? null,
      priority: AUTO_QUARANTINE.has(reason),
    });

    return json({
      ok: true,
      id: inserted.id,
      quarantined,
    });
  } catch (error) {
    console.error(error);
    return json(
      { error: error instanceof Error ? error.message : "Report failed." },
      500,
    );
  }
});

interface ReportBody {
  target_type?: string;
  target_id?: string;
  reason?: string;
  details?: string;
  reporter_email?: string;
}

type Evidence = Record<string, unknown> & { owner_id?: string | null };

async function snapshotEvidence(
  admin: ReturnType<typeof createClient>,
  targetType: string,
  targetId: string,
): Promise<Evidence> {
  const base: Evidence = { target_type: targetType, target_id: targetId, snapped_at: new Date().toISOString() };

  if (targetType === "catalog_model") {
    const { data } = await admin
      .from("furniture_catalog")
      .select("kind, label, user_id, visibility, thumbnail_path, model_url, quarantined_at")
      .eq("kind", targetId)
      .maybeSingle();
    if (data) {
      return {
        ...base,
        owner_id: data.user_id,
        label: data.label,
        visibility: data.visibility,
        thumbnail_path: data.thumbnail_path,
        model_url: data.model_url,
        quarantined_at: data.quarantined_at,
      };
    }
  }

  if (targetType === "room") {
    const { data } = await admin
      .from("rooms")
      .select("id, name, user_id, visibility, thumbnail_path, quarantined_at")
      .eq("id", targetId)
      .maybeSingle();
    if (data) {
      return {
        ...base,
        owner_id: data.user_id,
        name: data.name,
        visibility: data.visibility,
        thumbnail_path: data.thumbnail_path,
        quarantined_at: data.quarantined_at,
      };
    }
  }

  if (targetType === "profile" || targetType === "avatar") {
    const { data } = await admin
      .from("profiles")
      .select("id, handle, display_name, avatar_path, is_public")
      .or(`id.eq.${targetId},handle.eq.${targetId}`)
      .maybeSingle();
    if (data) {
      return {
        ...base,
        owner_id: data.id,
        handle: data.handle,
        display_name: data.display_name,
        avatar_path: data.avatar_path,
        is_public: data.is_public,
      };
    }
  }

  if (targetType === "share") {
    const { data } = await admin
      .from("room_shares")
      .select("token, room_id, created_by")
      .eq("token", targetId)
      .maybeSingle();
    if (data) {
      const { data: room } = await admin
        .from("rooms")
        .select("name")
        .eq("id", data.room_id)
        .maybeSingle();
      return {
        ...base,
        owner_id: data.created_by,
        room_id: data.room_id,
        token: data.token,
        name: room?.name ?? null,
      };
    }
  }

  return base;
}

type ProfileLabel = { handle: string | null; display_name: string | null };

async function loadProfile(
  admin: ReturnType<typeof createClient>,
  id: string | null,
): Promise<ProfileLabel | null> {
  if (!id) return null;
  const { data } = await admin
    .from("profiles")
    .select("handle, display_name")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    handle: typeof data.handle === "string" ? data.handle : null,
    display_name: typeof data.display_name === "string" ? data.display_name : null,
  };
}

function formatPersonName(handle?: string | null, displayName?: string | null): string | null {
  const h = handle?.trim().replace(/^@/, "") || null;
  const d = displayName?.trim() || null;
  if (h && d && d.toLowerCase() !== h.toLowerCase()) return `@${h} · ${d}`;
  if (h) return `@${h}`;
  if (d) return d;
  return null;
}

function formatPersonLine(opts: {
  id?: string | null;
  handle?: string | null;
  displayName?: string | null;
  email?: string | null;
  empty?: string;
}): string {
  const name = formatPersonName(opts.handle, opts.displayName);
  if (name && opts.id) return `${name} (${opts.id})`;
  if (name) return name;
  if (opts.email && opts.id) return `${opts.email} (${opts.id})`;
  if (opts.email) return opts.email;
  if (opts.id) return opts.id;
  return opts.empty ?? "(none)";
}

function targetLabelFromEvidence(evidence: Evidence): string | null {
  const label = typeof evidence.label === "string" ? evidence.label.trim() : "";
  const name = typeof evidence.name === "string" ? evidence.name.trim() : "";
  const display = typeof evidence.display_name === "string" ? evidence.display_name.trim() : "";
  const handle = typeof evidence.handle === "string" ? evidence.handle.trim() : "";
  if (label) return label;
  if (name) return name;
  if (display) return display;
  if (handle) return `@${handle.replace(/^@/, "")}`;
  return null;
}

async function sendSafetyAlert(opts: {
  reportId: string;
  reason: string;
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  quarantined: boolean;
  reporterId: string | null;
  reporterEmail: string | null;
  reporterHandle: string | null;
  reporterDisplayName: string | null;
  ownerId: string | null;
  ownerHandle: string | null;
  ownerDisplayName: string | null;
  priority: boolean;
}): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  // Comma-separated list, e.g. "ag@toova.net,yz@toova.net"
  const to = (Deno.env.get("SAFETY_ALERT_TO")?.trim() || "ag@toova.net")
    .split(",")
    .map((addr) => addr.trim())
    .filter((addr) => addr.includes("@"));
  const from = Deno.env.get("SAFETY_ALERT_FROM")?.trim()
    || "Toova Safety <ag@toova.net>";

  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping safety email for", opts.reportId);
    return;
  }
  if (to.length === 0) {
    console.warn("SAFETY_ALERT_TO empty — skipping safety email for", opts.reportId);
    return;
  }

  const target = opts.targetLabel
    ? `${opts.targetType} / ${opts.targetLabel} (${opts.targetId})`
    : `${opts.targetType} / ${opts.targetId}`;
  const subjectTarget = opts.targetLabel
    ? `${opts.targetType}: ${opts.targetLabel}`
    : opts.targetType;

  const subject = opts.priority
    ? `[PRIORITY] Toova report: ${opts.reason} (${subjectTarget})`
    : `Toova report: ${opts.reason} (${subjectTarget})`;

  const text = [
    `New content report ${opts.reportId}`,
    `Reason: ${opts.reason}`,
    `Target: ${target}`,
    `Quarantined: ${opts.quarantined ? "yes" : "no"}`,
    `Reported user: ${formatPersonLine({
      id: opts.ownerId,
      handle: opts.ownerHandle,
      displayName: opts.ownerDisplayName,
      empty: "(unknown)",
    })}`,
    `Reporter user: ${formatPersonLine({
      id: opts.reporterId,
      handle: opts.reporterHandle,
      displayName: opts.reporterDisplayName,
      empty: "(anonymous)",
    })}`,
    `Reporter email: ${opts.reporterEmail ?? "(none)"}`,
    "",
    "Review in AdminConsole → Reports.",
    "Do not download or forward reported media outside the admin tool.",
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Resend failed", res.status, detail);
  }
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
