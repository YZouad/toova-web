import {
  formBody,
  getOrCreateStripeCustomer,
  requireUserId,
  stripeRequest,
} from "../_shared/stripeBilling.ts";
import { handleBillingPortal } from "./handlePortal.ts";

Deno.serve((req: Request) =>
  handleBillingPortal(req, {
    requireUserId,
    getOrCreateStripeCustomer,
    stripeRequest,
    formBody,
    envGet: (name) => Deno.env.get(name),
  })
);
