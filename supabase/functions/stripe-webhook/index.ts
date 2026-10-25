import {
  claimStripeEvent,
  completeStripeEvent,
  failStripeEvent,
  fetchBillingProduct,
  requireEnv,
  restRpc,
  restUpsert,
} from "../_shared/stripeBilling.ts";
import { handleStripeEvent } from "./handleEvent.ts";
import { verifyStripeSignature } from "./stripeSignature.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = await verifyStripeSignature(
      req.headers.get("stripe-signature"),
      rawBody,
      requireEnv("STRIPE_WEBHOOK_SECRET"),
    ) as typeof event;
  } catch (err) {
    console.error("webhook verify", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const result = await handleStripeEvent(
    {
      claimStripeEvent,
      completeStripeEvent,
      failStripeEvent,
      fetchBillingProduct,
      restRpc,
      restUpsert,
    },
    event,
  );

  if (typeof result.body === "string") {
    return new Response(result.body, { status: result.status });
  }

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});
