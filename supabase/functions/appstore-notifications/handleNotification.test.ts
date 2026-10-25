/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { handleAppStoreNotification } from './handleNotification';

function makeDeps(overrides: Partial<Parameters<typeof handleAppStoreNotification>[0]> = {}) {
  return {
    claim: vi.fn(async () => ({ ok: true, claimed: true })),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    fulfill: vi.fn(async () => ({ ok: true })),
    revoke: vi.fn(async () => ({ ok: true })),
    expire: vi.fn(async () => ({ ok: true })),
    userForOriginalTxn: vi.fn(async () => null),
    msToIso: (ms: number | undefined | null) =>
      ms == null ? null : new Date(ms).toISOString(),
    parsePayload: vi.fn(async () => ({
      notification: {
        notificationType: 'DID_RENEW',
        notificationUUID: 'uuid-1',
        subtype: null,
      },
      transaction: {
        transactionId: 'txn-1',
        originalTransactionId: 'orig-1',
        productId: 'net.toova.pro.monthly',
        appAccountToken: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        expiresDate: Date.now() + 86_400_000,
        purchaseDate: Date.now(),
        environment: 'Sandbox',
      },
    })),
    ...overrides,
  };
}

describe('handleAppStoreNotification', () => {
  it('fulfills DID_RENEW and completes claim', async () => {
    const deps = makeDeps();
    const result = await handleAppStoreNotification(deps, 'signed');
    expect(result.status).toBe(200);
    expect(deps.fulfill).toHaveBeenCalledOnce();
    expect(deps.complete).toHaveBeenCalledWith('uuid-1');
  });

  it('skips duplicate notifications', async () => {
    const deps = makeDeps({
      claim: vi.fn(async () => ({ ok: true, claimed: false, duplicate: true })),
    });
    const result = await handleAppStoreNotification(deps, 'signed');
    expect(result.status).toBe(200);
    expect(result.body.duplicate).toBe(true);
    expect(deps.fulfill).not.toHaveBeenCalled();
  });

  it('expires on EXPIRED', async () => {
    const deps = makeDeps({
      parsePayload: vi.fn(async () => ({
        notification: {
          notificationType: 'EXPIRED',
          notificationUUID: 'uuid-exp',
        },
        transaction: {
          transactionId: 'txn-2',
          originalTransactionId: 'orig-2',
          productId: 'net.toova.pro.monthly',
        },
      })),
    });
    const result = await handleAppStoreNotification(deps, 'signed');
    expect(result.status).toBe(200);
    expect(deps.expire).toHaveBeenCalledWith('orig-2');
    expect(deps.fulfill).not.toHaveBeenCalled();
  });

  it('revokes on REFUND', async () => {
    const deps = makeDeps({
      parsePayload: vi.fn(async () => ({
        notification: {
          notificationType: 'REFUND',
          notificationUUID: 'uuid-ref',
        },
        transaction: {
          transactionId: 'txn-3',
          originalTransactionId: 'orig-3',
          productId: 'net.toova.credits.50',
        },
      })),
    });
    const result = await handleAppStoreNotification(deps, 'signed');
    expect(result.status).toBe(200);
    expect(deps.revoke).toHaveBeenCalledWith('txn-3', 'refund');
  });

  it('acks TEST without fulfill', async () => {
    const deps = makeDeps({
      parsePayload: vi.fn(async () => ({
        notification: {
          notificationType: 'TEST',
          notificationUUID: 'uuid-test',
        },
        transaction: null,
      })),
    });
    const result = await handleAppStoreNotification(deps, 'signed');
    expect(result.status).toBe(200);
    expect(result.body.test).toBe(true);
    expect(deps.fulfill).not.toHaveBeenCalled();
  });
});
