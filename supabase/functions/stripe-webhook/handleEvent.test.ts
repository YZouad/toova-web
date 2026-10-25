/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleStripeEvent, type WebhookDeps } from './handleEvent';

function makeDeps(overrides: Partial<WebhookDeps> = {}): WebhookDeps & {
  restRpc: ReturnType<typeof vi.fn>;
  claimStripeEvent: ReturnType<typeof vi.fn>;
  completeStripeEvent: ReturnType<typeof vi.fn>;
  failStripeEvent: ReturnType<typeof vi.fn>;
} {
  return {
    claimStripeEvent: vi.fn().mockResolvedValue({ ok: true, claimed: true }),
    completeStripeEvent: vi.fn().mockResolvedValue(undefined),
    failStripeEvent: vi.fn().mockResolvedValue(undefined),
    fetchBillingProduct: vi.fn().mockResolvedValue({
      sku: 'topup_50',
      kind: 'topup',
      credits_amount: 50,
      grant_tier: null,
      grant_months: null,
      stripe_price_id: 'price_x',
    }),
    restRpc: vi.fn().mockResolvedValue({ ok: true }),
    restUpsert: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as ReturnType<typeof makeDeps>;
}

describe('handleStripeEvent', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('skips duplicates without calling fulfillment', async () => {
    deps.claimStripeEvent.mockResolvedValue({
      ok: true,
      claimed: false,
      duplicate: true,
    });
    const result = await handleStripeEvent(deps, {
      id: 'evt_dup',
      type: 'checkout.session.completed',
      data: { object: {} },
    });
    expect(result).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    expect(deps.restRpc).not.toHaveBeenCalled();
  });

  it('returns 500 while another attempt is in flight', async () => {
    deps.claimStripeEvent.mockResolvedValue({
      ok: true,
      claimed: false,
      in_flight: true,
    });
    const result = await handleStripeEvent(deps, {
      id: 'evt_busy',
      type: 'checkout.session.completed',
    });
    expect(result.status).toBe(500);
  });

  it('fulfills paid top-up checkout and completes the event', async () => {
    const result = await handleStripeEvent(deps, {
      id: 'evt_pay',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test',
          payment_status: 'paid',
          amount_total: 999,
          currency: 'usd',
          payment_intent: 'pi_test',
          metadata: { user_id: 'user-1', kind: 'topup_50' },
        },
      },
    });
    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(deps.restRpc).toHaveBeenCalledWith(
      'fulfill_checkout_purchase',
      expect.objectContaining({
        p_uid: 'user-1',
        p_kind: 'topup_50',
        p_checkout_session_id: 'cs_test',
        p_payment_intent_id: 'pi_test',
        p_credits: 50,
      }),
    );
    expect(deps.completeStripeEvent).toHaveBeenCalledWith('evt_pay');
  });

  it('does not fulfill unpaid checkout.session.completed', async () => {
    await handleStripeEvent(deps, {
      id: 'evt_unpaid',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_unpaid',
          payment_status: 'unpaid',
          metadata: { user_id: 'user-1', kind: 'topup_50' },
        },
      },
    });
    expect(deps.restRpc).not.toHaveBeenCalled();
    expect(deps.completeStripeEvent).toHaveBeenCalledWith('evt_unpaid');
  });

  it('fulfills on async_payment_succeeded when paid', async () => {
    await handleStripeEvent(deps, {
      id: 'evt_async',
      type: 'checkout.session.async_payment_succeeded',
      data: {
        object: {
          id: 'cs_async',
          payment_status: 'paid',
          metadata: { user_id: 'user-1', kind: 'topup_50' },
          amount_total: 999,
        },
      },
    });
    expect(deps.restRpc).toHaveBeenCalledWith(
      'fulfill_checkout_purchase',
      expect.objectContaining({ p_checkout_session_id: 'cs_async' }),
    );
  });

  it('marks failed and returns 500 so Stripe retries', async () => {
    deps.restRpc.mockRejectedValue(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await handleStripeEvent(deps, {
      id: 'evt_fail',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_fail',
          payment_status: 'paid',
          metadata: { user_id: 'user-1', kind: 'topup_50' },
          amount_total: 1,
        },
      },
    });
    errSpy.mockRestore();
    expect(result.status).toBe(500);
    expect(deps.failStripeEvent).toHaveBeenCalledWith('evt_fail', 'db down');
    expect(deps.completeStripeEvent).not.toHaveBeenCalled();
  });

  it('clawbacks on charge.refunded using refund ids', async () => {
    await handleStripeEvent(deps, {
      id: 'evt_ref',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_1',
          payment_intent: 'pi_1',
          amount: 999,
          amount_refunded: 999,
          refunded: true,
          refunds: {
            data: [{ id: 're_1', amount: 999, status: 'succeeded' }],
          },
        },
      },
    });
    expect(deps.restRpc).toHaveBeenCalledWith(
      'process_purchase_refund',
      expect.objectContaining({
        p_stripe_refund_id: 're_1',
        p_payment_intent_id: 'pi_1',
        p_fully_refunded: true,
      }),
    );
  });

  it('reverses clawback on refund.failed', async () => {
    await handleStripeEvent(deps, {
      id: 'evt_ref_fail',
      type: 'refund.failed',
      data: { object: { id: 're_2' } },
    });
    expect(deps.restRpc).toHaveBeenCalledWith('reverse_purchase_refund', {
      p_stripe_refund_id: 're_2',
    });
  });
});
