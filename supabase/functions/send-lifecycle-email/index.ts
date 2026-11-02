/**
 * Drain lifecycle email outbox + enqueue candidates (finish room, credits, move-in).
 *
 * Secrets: RESEND_API_KEY, LIFECYCLE_EMAIL_FROM (optional), LIFECYCLE_CRON_SECRET,
 *          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PUBLIC_SITE_URL (optional)
 * verify_jwt = false — authorize with LIFECYCLE_CRON_SECRET or service role.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isOneClickUnsubscribe, renderLifecycleEmail } from "./templates.ts";

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
  const unsubscribeToken = url.searchParams.get("unsubscribe")?.trim() ?? "";

  // Human click (GET) or mail-client one-click (POST + RFC 8058 body).
  if (unsubscribeToken && (req.method === "GET" || req.method === "POST")) {
    if (req.method === "POST") {
      const body = await req.text();
      if (!isOneClickUnsubscribe(body, req.headers.get("List-Unsubscribe"))) {
        return json({ error: "Method not allowed." }, 405);
      }
    }
    const admin = serviceClient();
    const { data, error } = await admin.rpc("unsubscribe_lifecycle_email", {
      p_token: unsubscribeToken,
    });
    if (req.method === "POST") {
      if (error) return json({ error: "Could not unsubscribe." }, 400);
      return json({ ok: Boolean(data) });
    }
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

        const content = renderLifecycleEmail({
          template: row.template,
          payload: (row.payload ?? {}) as Record<string, unknown>,
          siteUrl: siteUrl(),
          unsubscribeUrl: unsubscribeUrl(unsubToken),
        });
        await sendResend({
          to: email,
          subject: content.subject,
          text: content.text,
          html: content.html,
          headers: content.headers,
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
    const status = error instanceof HttpError ? error.status : 500;
    return json(
      { error: error instanceof Error ? error.message : "Lifecycle email failed." },
      status,
    );
  }
});

function assertAuthorized(req: Request): void {
  const cronSecret = Deno.env.get("LIFECYCLE_CRON_SECRET")?.trim();
  if (!cronSecret || cronSecret.length < 16) {
    throw new HttpError(
      503,
      "LIFECYCLE_CRON_SECRET is not configured; drain refuses to run.",
    );
  }

  const headerSecret = req.headers.get("x-cron-secret")?.trim();
  if (headerSecret && timingSafeEqual(headerSecret, cronSecret)) return;

  const auth = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (serviceKey && auth === `Bearer ${serviceKey}`) return;

  throw new HttpError(401, "Unauthorized");
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa[i]! ^ bb[i]!;
  return out === 0;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
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

function unsubscribeUrl(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "";
  const base = `${requireEnv("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/send-lifecycle-email`;
  return `${base}?unsubscribe=${encodeURIComponent(trimmed)}`;
}

async function sendResend(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
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
      ...(Object.keys(opts.headers).length ? { headers: opts.headers } : {}),
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
