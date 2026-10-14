/** Billing Portal session creation (Deno + Vitest). */

import {
  allowedAppOrigins,
  resolveBillingReturnUrl,
  sameOriginAppUrl,
} from "../_shared/appUrls.ts";
import { corsHeaders, HttpError, json } from "../_shared/stripeBilling.ts";

export type PortalDeps = {
  requireUserId: (req: Request) => Promise<string>;
  getOrCreateStripeCustomer: (userId: string) => Promise<string>;
  stripeRequest: (
    path: string,
    init: RequestInit & { params?: Record<string, string> },
  ) => Promise<unknown>;
  formBody: (entries: Record<string, string | number | boolean | undefined>) => string;
  envGet: (name: string) => string | undefined;
};

export async function handleBillingPortal(
  req: Request,
  deps: PortalDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const userId = await deps.requireUserId(req);
    const body = await req.json() as { return_url?: unknown };

    const allowed = allowedAppOrigins(deps.envGet);
    const candidate = sameOriginAppUrl(body.return_url, allowed);
    const returnUrl = resolveBillingReturnUrl(
      candidate ?? null,
      deps.envGet,
    );

    const customerId = await deps.getOrCreateStripeCustomer(userId);

    const session = await deps.stripeRequest("/billing_portal/sessions", {
      method: "POST",
      body: deps.formBody({
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
}
