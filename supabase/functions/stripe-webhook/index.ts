import {
  fetchBillingProduct,
  recordStripeEvent,
  requireEnv,
  restRpc,
  restUpsert,
} from "../_shared/stripeBilling.ts";

async function verifyStripeSignature(req: Request, rawBody: string): Promise<unknown> {
  const secret = requireEnv("STRIPE_WEBHOOK_SECRET");
  const sig = req.headers.get("stripe-signature");
  if (!sig) throw new Error("Missing stripe-signature");

  const parts = sig.split(",").map((p) => p.trim());
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Parts = parts.filter((p) => p.startsWith("v1="));
  if (!tPart || v1Parts.length === 0) throw new Error("Invalid signature header");

  const timestamp = tPart.slice(2);
  const signedPayload = `${timestamp}.${rawBody}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload),
  );
  const expectedHex = [...new Uint8Array(expected)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const valid = v1Parts.some((p) => {
    const provided = p.slice(3);
    return timingSafeEqual(provided, expectedHex);
  });

  if (!valid) throw new Error("Signature verification failed");

  return JSON.parse(rawBody);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function tierFromSubscriptionMetadata(sub: Record<string, unknown>): string {
  const meta = sub.metadata as Record<string, string> | undefined;
  if (meta?.tier === "lite" || meta?.tier === "pro") return meta.tier;
  return "pro";
}

async function upsertSubscription(input: {
  userId: string;
  tier: string;
  status: string;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  source: string;
}): Promise<void> {
  await restUpsert("subscriptions", {
    user_id: input.userId,
    tier: input.tier,
    status: input.status,
    stripe_subscription_id: input.stripeSubscriptionId,
    current_period_end: input.currentPeriodEnd,
    cancel_at_period_end: input.cancelAtPeriodEnd,
    source: input.source,
    updated_at: new Date().toISOString(),
  }, "user_id");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = await verifyStripeSignature(req, rawBody) as typeof event;
  } catch (err) {
    console.error("webhook verify", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const eventId = event.id ?? "";
  const eventType = event.type ?? "";
  if (!eventId || !eventType) {
    return new Response("Bad event", { status: 400 });
  }

  const isNew = await recordStripeEvent(eventId, eventType);
  if (!isNew) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
  }

  try {
    const obj = event.data?.object ?? {};

    if (eventType === "checkout.session.completed") {
      const metadata = obj.metadata as Record<string, string> | undefined;
      const userId = metadata?.user_id?.trim();
      const kind = metadata?.kind?.trim();
      const mode = typeof obj.mode === "string" ? obj.mode : "";

      if (userId && kind?.startsWith("topup_")) {
        const product = await fetchBillingProduct(kind);
        const credits = product?.credits_amount ?? 0;
        const sessionId = typeof obj.id === "string" ? obj.id : eventId;
        if (credits > 0) {
          await restRpc("credit_topup", {
            p_uid: userId,
            p_credits: credits,
            p_ref: `stripe:checkout:${sessionId}`,
          });
        }
      }

      if (userId && kind === "semester_pass") {
        const product = await fetchBillingProduct("semester_pass");
        const months = product?.grant_months ?? 5;
        const tier = product?.grant_tier ?? "pro";
        const end = new Date();
        end.setMonth(end.getMonth() + months);
        await upsertSubscription({
          userId,
          tier,
          status: "active",
          stripeSubscriptionId: null,
          currentPeriodEnd: end.toISOString(),
          cancelAtPeriodEnd: false,
          source: "semester_pass",
        });
        await restRpc("apply_subscription_period", {
          p_uid: userId,
          p_tier: tier,
          p_period_end: end.toISOString(),
        });
      }

      if (mode === "subscription" && userId) {
        const subId = typeof obj.subscription === "string" ? obj.subscription : null;
        if (subId) {
          // Subscription details arrive via customer.subscription.* events.
        }
      }
    }

    if (
      eventType === "customer.subscription.created" ||
      eventType === "customer.subscription.updated" ||
      eventType === "customer.subscription.deleted"
    ) {
      const meta = obj.metadata as Record<string, string> | undefined;
      const userId = meta?.user_id?.trim();
      if (userId) {
        const status = typeof obj.status === "string" ? obj.status : "canceled";
        const tier = tierFromSubscriptionMetadata(obj);
        const periodEnd = typeof obj.current_period_end === "number"
          ? new Date(obj.current_period_end * 1000).toISOString()
          : null;
        const cancelAtPeriodEnd = Boolean(obj.cancel_at_period_end);
        const subId = typeof obj.id === "string" ? obj.id : null;

        await upsertSubscription({
          userId,
          tier,
          status,
          stripeSubscriptionId: subId,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd,
          source: "subscription",
        });

        if (status === "active" || status === "trialing") {
          await restRpc("apply_subscription_period", {
            p_uid: userId,
            p_tier: tier,
            p_period_end: periodEnd,
          });
        }
      }
    }

    if (eventType === "invoice.paid") {
      const subDetails = obj.parent as { subscription_details?: { metadata?: Record<string, string> } } | undefined;
      const meta = subDetails?.subscription_details?.metadata ??
        (obj.subscription_details as { metadata?: Record<string, string> } | undefined)?.metadata;
      const userId = meta?.user_id?.trim();
      const tier = meta?.tier === "lite" ? "lite" : meta?.tier === "pro" ? "pro" : null;
      const periodEnd = typeof obj.lines === "object"
        ? null
        : null;
      const linePeriodEnd = Array.isArray((obj.lines as { data?: unknown[] })?.data)
        ? (obj.lines as { data: Array<{ period?: { end?: number } }> }).data[0]?.period?.end
        : undefined;
      const endIso = typeof linePeriodEnd === "number"
        ? new Date(linePeriodEnd * 1000).toISOString()
        : typeof obj.period_end === "number"
        ? new Date(obj.period_end * 1000).toISOString()
        : periodEnd;

      if (userId && tier) {
        await restRpc("apply_subscription_period", {
          p_uid: userId,
          p_tier: tier,
          p_period_end: endIso,
        });
      }
    }

    if (eventType === "charge.refunded") {
      const paymentIntent = typeof obj.payment_intent === "string" ? obj.payment_intent : null;
      if (paymentIntent) {
        // Top-up clawback: best-effort if we stored checkout session id on ledger ref stripe:checkout:{session}
        // Full clawback RPC can be added when partial refunds matter.
      }
    }
  } catch (err) {
    console.error("webhook handler", eventType, err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
