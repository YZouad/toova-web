/** Stripe webhook event routing (Deno + Vitest). */

export type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
};

export type BillingProduct = {
  sku: string;
  kind: string;
  credits_amount: number | null;
  grant_tier: string | null;
  grant_months: number | null;
  stripe_price_id: string | null;
};

export type ClaimResult = {
  ok: boolean;
  claimed?: boolean;
  duplicate?: boolean;
  in_flight?: boolean;
  retried?: boolean;
  status?: string;
  attempt_count?: number;
};

export type WebhookDeps = {
  claimStripeEvent: (eventId: string, eventType: string) => Promise<ClaimResult>;
  completeStripeEvent: (eventId: string) => Promise<void>;
  failStripeEvent: (eventId: string, error: string) => Promise<void>;
  fetchBillingProduct: (sku: string) => Promise<BillingProduct | null>;
  restRpc: (rpc: string, body: Record<string, unknown>) => Promise<unknown>;
  restUpsert: (table: string, row: Record<string, unknown>, onConflict: string) => Promise<void>;
};

function tierFromSubscriptionMetadata(sub: Record<string, unknown>): string {
  const meta = sub.metadata as Record<string, string> | undefined;
  if (meta?.tier === "lite" || meta?.tier === "pro") return meta.tier;
  return "pro";
}

async function upsertSubscription(
  deps: WebhookDeps,
  input: {
    userId: string;
    tier: string;
    status: string;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    source: string;
  },
): Promise<void> {
  await deps.restUpsert("subscriptions", {
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

function paymentIntentId(obj: Record<string, unknown>): string | null {
  const pi = obj.payment_intent;
  if (typeof pi === "string" && pi.trim()) return pi.trim();
  return null;
}

function sessionIsPayable(obj: Record<string, unknown>): boolean {
  const status = typeof obj.payment_status === "string" ? obj.payment_status : "";
  return status === "paid" || status === "no_payment_required";
}

async function fulfillCheckoutSession(
  deps: WebhookDeps,
  obj: Record<string, unknown>,
): Promise<void> {
  if (!sessionIsPayable(obj)) return;

  const metadata = obj.metadata as Record<string, string> | undefined;
  const userId = metadata?.user_id?.trim();
  const kind = metadata?.kind?.trim();
  if (!userId || !kind) return;

  const isTopup = kind.startsWith("topup_");
  const isSemester = kind === "semester_pass";
  if (!isTopup && !isSemester) return;

  const sessionId = typeof obj.id === "string" ? obj.id : null;
  if (!sessionId) throw new Error("checkout session missing id");

  const product = await deps.fetchBillingProduct(kind);
  const amountTotal = typeof obj.amount_total === "number" ? obj.amount_total : 0;
  const currency = typeof obj.currency === "string" ? obj.currency : "usd";

  await deps.restRpc("fulfill_checkout_purchase", {
    p_uid: userId,
    p_kind: kind,
    p_checkout_session_id: sessionId,
    p_payment_intent_id: paymentIntentId(obj),
    p_amount_total_cents: amountTotal,
    p_currency: currency,
    p_credits: isTopup ? (product?.credits_amount ?? 0) : 0,
    p_grant_tier: isSemester ? (product?.grant_tier ?? "pro") : null,
    p_grant_months: isSemester ? (product?.grant_months ?? 5) : null,
  });
}

async function handleSubscriptionEvent(
  deps: WebhookDeps,
  obj: Record<string, unknown>,
): Promise<void> {
  const meta = obj.metadata as Record<string, string> | undefined;
  const userId = meta?.user_id?.trim();
  if (!userId) return;

  const status = typeof obj.status === "string" ? obj.status : "canceled";
  const tier = tierFromSubscriptionMetadata(obj);
  const periodEnd = typeof obj.current_period_end === "number"
    ? new Date(obj.current_period_end * 1000).toISOString()
    : null;
  const cancelAtPeriodEnd = Boolean(obj.cancel_at_period_end);
  const subId = typeof obj.id === "string" ? obj.id : null;

  await upsertSubscription(deps, {
    userId,
    tier,
    status,
    stripeSubscriptionId: subId,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd,
    source: "subscription",
  });

  if (status === "active" || status === "trialing") {
    await deps.restRpc("apply_subscription_period", {
      p_uid: userId,
      p_tier: tier,
      p_period_end: periodEnd,
    });
  }
}

async function handleInvoicePaid(
  deps: WebhookDeps,
  obj: Record<string, unknown>,
): Promise<void> {
  const subDetails = obj.parent as {
    subscription_details?: { metadata?: Record<string, string> };
  } | undefined;
  const meta = subDetails?.subscription_details?.metadata ??
    (obj.subscription_details as { metadata?: Record<string, string> } | undefined)?.metadata;
  const userId = meta?.user_id?.trim();
  const tier = meta?.tier === "lite" ? "lite" : meta?.tier === "pro" ? "pro" : null;

  const linePeriodEnd = Array.isArray((obj.lines as { data?: unknown[] })?.data)
    ? (obj.lines as { data: Array<{ period?: { end?: number } }> }).data[0]?.period?.end
    : undefined;
  const endIso = typeof linePeriodEnd === "number"
    ? new Date(linePeriodEnd * 1000).toISOString()
    : typeof obj.period_end === "number"
    ? new Date(obj.period_end * 1000).toISOString()
    : null;

  if (userId && tier) {
    await deps.restRpc("apply_subscription_period", {
      p_uid: userId,
      p_tier: tier,
      p_period_end: endIso,
    });
  }
}

function refundIdsFromCharge(obj: Record<string, unknown>): Array<{
  id: string;
  amount: number;
  status: string;
}> {
  const refunds = obj.refunds as { data?: Array<Record<string, unknown>> } | undefined;
  if (!Array.isArray(refunds?.data)) return [];
  return refunds.data
    .map((r) => ({
      id: typeof r.id === "string" ? r.id : "",
      amount: typeof r.amount === "number" ? r.amount : 0,
      status: typeof r.status === "string" ? r.status : "succeeded",
    }))
    .filter((r) => r.id);
}

async function handleChargeRefunded(
  deps: WebhookDeps,
  obj: Record<string, unknown>,
): Promise<void> {
  const paymentIntent = paymentIntentId(obj);
  const chargeId = typeof obj.id === "string" ? obj.id : null;
  const amountRefunded = typeof obj.amount_refunded === "number" ? obj.amount_refunded : 0;
  const amount = typeof obj.amount === "number" ? obj.amount : 0;
  const fullyRefunded = Boolean(obj.refunded) || (amount > 0 && amountRefunded >= amount);

  const refunds = refundIdsFromCharge(obj);
  if (refunds.length === 0) {
    // Fallback when expanded refunds are absent: use charge id as idempotency key.
    if (!paymentIntent && !chargeId) return;
    await deps.restRpc("process_purchase_refund", {
      p_stripe_refund_id: chargeId ? `charge:${chargeId}:cumulative` : `pi:${paymentIntent}:cumulative`,
      p_payment_intent_id: paymentIntent,
      p_checkout_session_id: null,
      p_charge_id: chargeId,
      p_amount_cents: amountRefunded,
      p_charge_amount_refunded_cents: amountRefunded,
      p_fully_refunded: fullyRefunded,
    });
    return;
  }

  for (const refund of refunds) {
    if (refund.status === "failed" || refund.status === "canceled") continue;
    await deps.restRpc("process_purchase_refund", {
      p_stripe_refund_id: refund.id,
      p_payment_intent_id: paymentIntent,
      p_checkout_session_id: null,
      p_charge_id: chargeId,
      p_amount_cents: refund.amount,
      p_charge_amount_refunded_cents: amountRefunded,
      p_fully_refunded: fullyRefunded,
    });
  }
}

async function handleRefundCreated(
  deps: WebhookDeps,
  obj: Record<string, unknown>,
): Promise<void> {
  const refundId = typeof obj.id === "string" ? obj.id : null;
  if (!refundId) return;
  const status = typeof obj.status === "string" ? obj.status : "succeeded";
  if (status === "failed" || status === "canceled") return;

  const paymentIntent = paymentIntentId(obj);
  const chargeId = typeof obj.charge === "string" ? obj.charge : null;
  const amount = typeof obj.amount === "number" ? obj.amount : 0;

  await deps.restRpc("process_purchase_refund", {
    p_stripe_refund_id: refundId,
    p_payment_intent_id: paymentIntent,
    p_checkout_session_id: null,
    p_charge_id: chargeId,
    p_amount_cents: amount,
    p_charge_amount_refunded_cents: null,
    p_fully_refunded: false,
  });
}

async function handleRefundFailed(
  deps: WebhookDeps,
  obj: Record<string, unknown>,
): Promise<void> {
  const refundId = typeof obj.id === "string" ? obj.id : null;
  if (!refundId) return;
  await deps.restRpc("reverse_purchase_refund", {
    p_stripe_refund_id: refundId,
  });
}

export async function processStripeEventPayload(
  deps: WebhookDeps,
  event: StripeEvent,
): Promise<void> {
  const eventType = event.type ?? "";
  const obj = event.data?.object ?? {};

  if (
    eventType === "checkout.session.completed" ||
    eventType === "checkout.session.async_payment_succeeded"
  ) {
    await fulfillCheckoutSession(deps, obj);
    return;
  }

  if (eventType === "checkout.session.async_payment_failed") {
    // Acknowledge without granting entitlements.
    return;
  }

  if (
    eventType === "customer.subscription.created" ||
    eventType === "customer.subscription.updated" ||
    eventType === "customer.subscription.deleted"
  ) {
    await handleSubscriptionEvent(deps, obj);
    return;
  }

  if (eventType === "invoice.paid") {
    await handleInvoicePaid(deps, obj);
    return;
  }

  if (eventType === "charge.refunded") {
    await handleChargeRefunded(deps, obj);
    return;
  }

  if (eventType === "refund.created") {
    await handleRefundCreated(deps, obj);
    return;
  }

  if (eventType === "refund.failed") {
    await handleRefundFailed(deps, obj);
  }
}

export type HandleEventResult =
  | { status: 200; body: Record<string, unknown> }
  | { status: 400 | 500; body: string };

export async function handleStripeEvent(
  deps: WebhookDeps,
  event: StripeEvent,
): Promise<HandleEventResult> {
  const eventId = event.id ?? "";
  const eventType = event.type ?? "";
  if (!eventId || !eventType) {
    return { status: 400, body: "Bad event" };
  }

  let claim: ClaimResult;
  try {
    claim = await deps.claimStripeEvent(eventId, eventType);
  } catch (err) {
    console.error("claim_stripe_event", err);
    return { status: 500, body: "Claim failed" };
  }

  if (claim.duplicate) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }
  if (claim.in_flight) {
    // Ask Stripe to retry; another worker may still be fulfilling.
    return { status: 500, body: "In flight" };
  }
  if (!claim.claimed) {
    return { status: 500, body: "Claim rejected" };
  }

  try {
    await processStripeEventPayload(deps, event);
    await deps.completeStripeEvent(eventId);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("webhook handler", eventType, err);
    await deps.failStripeEvent(eventId, message);
    return { status: 500, body: "Handler error" };
  }
}
