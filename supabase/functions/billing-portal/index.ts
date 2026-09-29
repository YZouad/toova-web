import {
  corsHeaders,
  formBody,
  getOrCreateStripeCustomer,
  HttpError,
  json,
  requireUserId,
  stripeRequest,
} from "../_shared/stripeBilling.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const userId = await requireUserId(req);
    const body = await req.json() as { return_url?: unknown };
    const origin = req.headers.get("origin")?.trim() || "https://toova.net";
    const returnUrl = typeof body.return_url === "string" && body.return_url.trim()
      ? body.return_url.trim()
      : `${origin}/`;

    const customerId = await getOrCreateStripeCustomer(userId);

    const session = await stripeRequest("/billing_portal/sessions", {
      method: "POST",
      body: formBody({
        customer: customerId,
        return_url: returnUrl,
      }),
    }) as { url?: string };

    if (!session.url) {
      return json({ error: "Could not open billing portal." }, 502);
    }

    return json({ url: session.url });
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: "Portal failed." }, 500);
  }
});
