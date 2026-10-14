import {
  fetchBillingProduct,
  fetchPlanPriceId,
  formBody,
  getOrCreateStripeCustomer,
  requireUserId,
  stripeRequest,
} from "../_shared/stripeBilling.ts";
import { handleBillingCheckout } from "./handleCheckout.ts";

Deno.serve((req: Request) =>
  handleBillingCheckout(req, {
    requireUserId,
    getOrCreateStripeCustomer,
    fetchPlanPriceId,
    fetchBillingProduct,
    stripeRequest,
    formBody,
    envGet: (name) => Deno.env.get(name),
  })
);
