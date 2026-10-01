import {
  corsHeaders,
  fetchBillingProduct,
  fetchPlanPriceId,
  formBody,
  getOrCreateStripeCustomer,
  HttpError,
  json,
  requireUserId,
  stripeRequest,
} from "../_shared/stripeBilling.ts";

type CheckoutKind =
  | "lite_monthly"
  | "lite_yearly"
  | "pro_monthly"
  | "pro_yearly"
  | "topup_50"
  | "topup_150"
  | "topup_400"
  | "semester_pass";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const userId = await requireUserId(req);
    const body = await req.json() as {
      kind?: unknown;
      success_url?: unknown;
      cancel_url?: unknown;
    };

    const kind = typeof body.kind === "string" ? body.kind.trim() as CheckoutKind : "";
    if (!kind) return json({ error: "Missing checkout kind." }, 400);

    const origin = req.headers.get("origin")?.trim() || "https://toova.net";
    const successUrl = typeof body.success_url === "string" && body.success_url.trim()
      ? body.success_url.trim()
      : `${origin}/?checkout=success`;
    const cancelUrl = typeof body.cancel_url === "string" && body.cancel_url.trim()
      ? body.cancel_url.trim()
      : `${origin}/?checkout=cancel`;

    const customerId = await getOrCreateStripeCustomer(userId);

    let mode: "subscription" | "payment" = "payment";
    let priceId: string | null = null;
    let metadataKind = kind;
    let tier: string | undefined;

    if (kind === "lite_monthly") {
      mode = "subscription";
      tier = "lite";
      priceId = await fetchPlanPriceId("lite", "monthly");
    } else if (kind === "lite_yearly") {
      mode = "subscription";
      tier = "lite";
      priceId = await fetchPlanPriceId("lite", "yearly");
    } else if (kind === "pro_monthly") {
      mode = "subscription";
      tier = "pro";
      priceId = await fetchPlanPriceId("pro", "monthly");
    } else if (kind === "pro_yearly") {
      mode = "subscription";
      tier = "pro";
      priceId = await fetchPlanPriceId("pro", "yearly");
    } else if (
      kind === "topup_50" || kind === "topup_150" || kind === "topup_400" || kind === "semester_pass"
    ) {
      const product = await fetchBillingProduct(kind);
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
      "automatic_tax[enabled]": true,
    };

    if (mode === "subscription" && tier) {
      sessionBody["subscription_data[metadata][user_id]"] = userId;
      sessionBody["subscription_data[metadata][tier]"] = tier;
    }

    const session = await stripeRequest("/checkout/sessions", {
      method: "POST",
      body: formBody(sessionBody),
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
});
