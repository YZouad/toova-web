/**
 * Drain lifecycle email outbox + enqueue candidates (finish room, credits, move-in).
 *
 * Secrets: RESEND_API_KEY, LIFECYCLE_EMAIL_FROM (optional), LIFECYCLE_CRON_SECRET,
 *          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PUBLIC_SITE_URL (optional)
 * verify_jwt = false — authorize with LIFECYCLE_CRON_SECRET or service role.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);

  // One-click unsubscribe
  if (req.method === "GET" && url.searchParams.get("unsubscribe")) {
    const token = url.searchParams.get("unsubscribe")!.trim();
    const admin = serviceClient();
    const { data, error } = await admin.rpc("unsubscribe_lifecycle_email", {
      p_token: token,
    });
    if (error) return html("Could not unsubscribe.", 400);
    return html(
      data
        ? "You’re unsubscribed from Toova emails."
        : "This unsubscribe link is invalid or already used.",
    );
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    assertAuthorized(req);
    const admin = serviceClient();

    const enqueue = await admin.rpc("enqueue_lifecycle_candidates");
    if (enqueue.error) {
      console.warn("enqueue_lifecycle_candidates", enqueue.error.message);
    }

    const { data: pending, error: listErr } = await admin
      .from("email_outbox")
      .select("id,user_id,template,payload,idempotency_key")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);

    if (listErr) throw new Error(listErr.message);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of pending ?? []) {
      try {
        const prefs = await admin.rpc("ensure_notification_prefs", {
          p_uid: row.user_id,
        });
        const unsubToken =
          prefs.data && typeof prefs.data === "object"
            ? String((prefs.data as { unsubscribe_token?: string }).unsubscribe_token ?? "")
            : "";

        const email = await lookupUserEmail(admin, row.user_id);
        if (!email) {
          await markOutbox(admin, row.id, "skipped", "no email");
          skipped++;
          continue;
        }

        const content = renderTemplate(row.template, row.payload ?? {}, unsubToken);
        await sendResend({
          to: email,
          subject: content.subject,
          text: content.text,
          html: content.html,
        });
        await markOutbox(admin, row.id, "sent");
        sent++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await markOutbox(admin, row.id, "failed", message.slice(0, 500));
        failed++;
      }
    }

    return json({
      ok: true,
      enqueued: enqueue.data ?? null,
      sent,
      failed,
      skipped,
      pending: (pending ?? []).length,
    });
  } catch (error) {
    console.error(error);
    return json(
      { error: error instanceof Error ? error.message : "Lifecycle email failed." },
      500,
    );
  }
});

function assertAuthorized(req: Request): void {
  const cronSecret = Deno.env.get("LIFECYCLE_CRON_SECRET")?.trim();
  const headerSecret = req.headers.get("x-cron-secret")?.trim();
  if (cronSecret) {
    if (headerSecret && headerSecret === cronSecret) return;
  } else if (!cronSecret) {
    // Bootstrap: allow cron drain until LIFECYCLE_CRON_SECRET is configured.
    console.warn("LIFECYCLE_CRON_SECRET unset — allowing drain request");
    return;
  }

  const auth = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (serviceKey && auth === `Bearer ${serviceKey}`) return;

  throw new Error("Unauthorized");
}

function serviceClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

async function lookupUserEmail(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) return null;
  const email = data.user?.email?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

async function markOutbox(
  admin: ReturnType<typeof createClient>,
  id: string,
  status: "sent" | "skipped" | "failed",
  error?: string,
): Promise<void> {
  await admin
    .from("email_outbox")
    .update({
      status,
      error: error ?? null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", id);
}

function siteUrl(): string {
  return (Deno.env.get("PUBLIC_SITE_URL")?.trim() || "https://toova.net").replace(/\/$/, "");
}

function renderTemplate(
  template: string,
  payload: Record<string, unknown>,
  unsubToken: string,
): { subject: string; text: string; html: string } {
  const unsub = unsubToken
    ? `${siteUrl().replace("https://toova.net", Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || "")}/functions/v1/send-lifecycle-email?unsubscribe=${encodeURIComponent(unsubToken)}`
    : "";
  // Prefer functions URL for unsubscribe
  const functionsBase = `${requireEnv("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/send-lifecycle-email`;
  const unsubUrl = unsubToken
    ? `${functionsBase}?unsubscribe=${encodeURIComponent(unsubToken)}`
    : "";

  const roomName = typeof payload.room_name === "string" ? payload.room_name : "your room";
  const label = typeof payload.label === "string" ? payload.label : "your model";

  let subject = "Toova";
  let body = "";
  switch (template) {
    case "finish_room":
      subject = "Finish your room on Toova";
      body =
        "You started designing a room — come back and place a few more pieces so it feels like home.\n\n" +
        `${siteUrl()}/`;
      break;
    case "model_ready":
      subject = "Your 3D model is ready";
      body = `${label} finished generating. Open Toova to save it into your catalog.\n\n${siteUrl()}/`;
      break;
    case "room_liked":
      subject = "People liked your rooms today";
      body = `Someone liked ${roomName} (and maybe more). Check your gallery notifications.\n\n${siteUrl()}/gallery`;
      break;
    case "room_copied":
      subject = "Someone copied your room";
      body = `${roomName} was remixed today. See what’s trending.\n\n${siteUrl()}/gallery`;
      break;
    case "credits_refreshed":
      subject = "Your monthly Toova credits refreshed";
      body =
        "Your monthly AI credits are topped up. Import a photo and place something new.\n\n" +
        `${siteUrl()}/`;
      break;
    case "move_in_countdown":
      subject = "Your move-in checklist is waiting";
      body =
        "You still have checklist items to buy or mark as have. Open your shopping list before move-in.\n\n" +
        `${siteUrl()}/`;
      break;
    default:
      subject = "Toova update";
      body = `Open Toova: ${siteUrl()}/`;
  }

  const footer = unsubUrl
    ? `\n\n—\nUnsubscribe: ${unsubUrl}`
    : "\n\n—\nToova";

  const text = body + footer;
  const html = `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>` +
    (unsubUrl
      ? `<p style="color:#888;font-size:12px"><a href="${unsubUrl}">Unsubscribe</a></p>`
      : "");

  return { subject, text, html };
}

async function sendResend(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY not set");
  const from = Deno.env.get("LIFECYCLE_EMAIL_FROM")?.trim() ||
    Deno.env.get("SAFETY_ALERT_FROM")?.trim() ||
    "Toova <hello@toova.net>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
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

function html(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui;padding:2rem">${body}</body></html>`,
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    },
  );
}
