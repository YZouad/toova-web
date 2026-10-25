/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { handleBillingCheckout } from './handleCheckout';
import { formBody } from '../_shared/stripeBilling';

function makeReq(body: unknown): Request {
  return new Request('https://functions.local/billing-checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('handleBillingCheckout', () => {
  it('ignores cross-origin success/cancel URLs', async () => {
    const stripeRequest = vi.fn().mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test',
      id: 'cs_test',
    });
    const res = await handleBillingCheckout(
      makeReq({
        kind: 'topup_50',
        success_url: 'https://evil.example/ok',
        cancel_url: 'https://evil.example/cancel',
      }),
      {
        requireUserId: async () => 'user-1',
        getOrCreateStripeCustomer: async () => 'cus_1',
        fetchPlanPriceId: async () => null,
        fetchBillingProduct: async () => ({
          sku: 'topup_50',
          kind: 'topup',
          credits_amount: 50,
          grant_tier: null,
          grant_months: null,
          stripe_price_id: 'price_50',
        }),
        stripeRequest,
        formBody,
        envGet: () => undefined,
      },
    );
    expect(res.status).toBe(200);
    const posted = stripeRequest.mock.calls[0][1].body as string;
    expect(posted).toContain(encodeURIComponent('https://toova.net/?checkout=success'));
    expect(posted).toContain(encodeURIComponent('https://toova.net/?checkout=cancel'));
    expect(posted).not.toContain('evil.example');
  });

  it('returns 503 when price is not configured', async () => {
    const res = await handleBillingCheckout(makeReq({ kind: 'topup_50' }), {
      requireUserId: async () => 'user-1',
      getOrCreateStripeCustomer: async () => 'cus_1',
      fetchPlanPriceId: async () => null,
      fetchBillingProduct: async () => ({
        sku: 'topup_50',
        kind: 'topup',
        credits_amount: 50,
        grant_tier: null,
        grant_months: null,
        stripe_price_id: null,
      }),
      stripeRequest: vi.fn(),
      formBody,
      envGet: () => undefined,
    });
    expect(res.status).toBe(503);
  });

  it('rejects unknown kinds', async () => {
    const res = await handleBillingCheckout(makeReq({ kind: 'nope' }), {
      requireUserId: async () => 'user-1',
      getOrCreateStripeCustomer: async () => 'cus_1',
      fetchPlanPriceId: async () => null,
      fetchBillingProduct: async () => null,
      stripeRequest: vi.fn(),
      formBody,
      envGet: () => undefined,
    });
    expect(res.status).toBe(400);
  });
});
