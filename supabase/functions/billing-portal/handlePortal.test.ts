/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { handleBillingPortal } from './handlePortal';
import { HttpError, formBody } from '../_shared/stripeBilling';

function makeReq(body: unknown, origin = 'https://evil.example'): Request {
  return new Request('https://functions.local/billing-portal', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
    },
    body: JSON.stringify(body),
  });
}

describe('handleBillingPortal', () => {
  it('rejects cross-origin return_url and uses canonical fallback', async () => {
    const stripeRequest = vi.fn().mockResolvedValue({
      url: 'https://billing.stripe.com/session/test',
    });
    const res = await handleBillingPortal(makeReq({ return_url: 'https://evil.example/x' }), {
      requireUserId: async () => 'user-1',
      getOrCreateStripeCustomer: async () => 'cus_1',
      stripeRequest,
      formBody,
      envGet: () => undefined,
    });
    expect(res.status).toBe(200);
    const body = formBody({
      customer: 'cus_1',
      return_url: 'https://toova.net/',
    });
    expect(stripeRequest).toHaveBeenCalledWith('/billing_portal/sessions', {
      method: 'POST',
      body,
    });
  });

  it('accepts same-origin return_url from allowlist', async () => {
    const stripeRequest = vi.fn().mockResolvedValue({
      url: 'https://billing.stripe.com/session/test',
    });
    await handleBillingPortal(
      makeReq({ return_url: 'https://toova.net/pricing' }),
      {
        requireUserId: async () => 'user-1',
        getOrCreateStripeCustomer: async () => 'cus_1',
        stripeRequest,
        formBody,
        envGet: () => undefined,
      },
    );
    expect(stripeRequest.mock.calls[0][1].body).toContain(
      encodeURIComponent('https://toova.net/pricing'),
    );
  });

  it('maps auth failures to 401', async () => {
    const res = await handleBillingPortal(makeReq({}), {
      requireUserId: async () => {
        throw new HttpError(401, 'Invalid or expired session.');
      },
      getOrCreateStripeCustomer: async () => 'cus_1',
      stripeRequest: vi.fn(),
      formBody,
      envGet: () => undefined,
    });
    expect(res.status).toBe(401);
  });
});
