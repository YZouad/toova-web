/** Billing Checkout session creation (Deno + Vitest). */

import {
  allowedAppOrigins,
  canonicalAppOrigin,
  sameOriginAppUrl,
  withCheckoutFlag,
} from "../_shared/appUrls.ts";
import { corsHeaders, HttpError, json } from "../_shared/stripeBilling.ts";

export type CheckoutKind =
  | "lite_monthly"
  | "lite_yearly"
  | "pro_monthly"
  | "pro_yearly"
  | "topup_50"
  | "topup_150"
  | "topup_400"
  | "semester_pass";

export type CheckoutDeps = {
  requireUserId: (req: Request) => Promise<string>;
  getOrCreateStripeCustomer: (userId: string) => Promise<string>;
  fetchPlanPriceId: (tier: string, interval: "monthly" | "yearly") => Promise<string | null>;
  fetchBillingProduct: (sku: string) => Promise<{
    sku: string;
    kind: string;
    credits_amount: number | null;
    grant_tier: string | null;
    grant_months: number | null;
    stripe_price_id: string | null;
  } | null>;
  /** Active subscription source for this user, if any (`subscription` | `app_store` | …). */
  fetchActiveSubscriptionSource?: (userId: string) => Promise<string | null>;
  stripeRequest: (
    path: string,
    init: RequestInit & { params?: Record<string, string> },
  ) => Promise<unknown>;
  formBody: (entries: Record<string, string | number | boolean | undefined>) => string;
  envGet: (name: string) => string | undefined;
};

export async function handleBillingCheckout(
  req: Request,
  deps: CheckoutDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const userId = await deps.requireUserId(req);
    const body = await req.json() as {
      kind?: unknown;
      success_url?: unknown;
      cancel_url?: unknown;
    };

    const kind = typeof body.kind === "string" ? body.kind.trim() as CheckoutKind : "";
    if (!kind) return json({ error: "Missing checkout kind." }, 400);

    const allowed = allowedAppOrigins(deps.envGet);
    const fallback = `${canonicalAppOrigin(deps.envGet)}/`;
    const successUrl = sameOriginAppUrl(body.success_url, allowed)
      ?? withCheckoutFlag(fallback, "success");
    const cancelUrl = sameOriginAppUrl(body.cancel_url, allowed)
      ?? withCheckoutFlag(fallback, "cancel");

    const customerId = await deps.getOrCreateStripeCustomer(userId);

    let mode: "subscription" | "payment" = "payment";
    let priceId: string | null = null;
    let metadataKind = kind;
    let tier: string | undefined;

    const isSubscriptionKind =
      kind === "lite_monthly" || kind === "lite_yearly"
      || kind === "pro_monthly" || kind === "pro_yearly"
      || kind === "semester_pass";

    if (isSubscriptionKind && deps.fetchActiveSubscriptionSource) {
      const source = await deps.fetchActiveSubscriptionSource(userId);
      if (source === "app_store") {
        return json({
          error: "managed_on_app_store",
          message: "Your plan is managed through the App Store. Change or cancel it there.",
        }, 409);
      }
    }

    if (kind === "lite_monthly") {
      mode = "subscription";
      tier = "lite";
      priceId = await deps.fetchPlanPriceId("lite", "monthly");
    } else if (kind === "lite_yearly") {
      mode = "subscription";
      tier = "lite";
      priceId = await deps.fetchPlanPriceId("lite", "yearly");
    } else if (kind === "pro_monthly") {
      mode = "subscription";
      tier = "pro";
      priceId = await deps.fetchPlanPriceId("pro", "monthly");
    } else if (kind === "pro_yearly") {
      mode = "subscription";
      tier = "pro";
      priceId = await deps.fetchPlanPriceId("pro", "yearly");
    } else if (
      kind === "topup_50" || kind === "topup_150" || kind === "topup_400" || kind === "semester_pass"
    ) {
      const product = await deps.fetchBillingProduct(kind);
      priceId = product?.stripe_price_id ?? null;
      metadataKind = kind;
    } else {
      return json({ error: "Unknown checkout kind." }, 400);
    }

    if (!priceId) {
      return json({
        error: "billing_not_configured",
        message: "Stripe price is not configured for this product yet.",
      }, 503);
    }

    const sessionBody: Record<string, string | number | boolean | undefined> = {
      mode,
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": 1,
      "metadata[user_id]": userId,
      "metadata[kind]": metadataKind,
    };

    // Requires a head office address in Stripe Tax settings
    // (Dashboard → Settings → Tax). Opt in with STRIPE_AUTOMATIC_TAX=true.
    if (deps.envGet("STRIPE_AUTOMATIC_TAX")?.trim() === "true") {
      sessionBody["automatic_tax[enabled]"] = true;
    }

    if (mode === "subscription" && tier) {
      sessionBody["subscription_data[metadata][user_id]"] = userId;
      sessionBody["subscription_data[metadata][tier]"] = tier;
    }

    const session = await deps.stripeRequest("/checkout/sessions", {
      method: "POST",
      body: deps.formBody(sessionBody),
    }) as { url?: string; id?: string };

    if (!session.url) {
      return json({ error: "Could not create checkout session." }, 502);
    }

    return json({ url: session.url, session_id: session.id });
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: "Checkout failed." }, 500);
  }
}
