/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { timingSafeEqual, verifyStripeSignature } from './stripeSignature';

async function sign(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

describe('stripeSignature', () => {
  it('timingSafeEqual rejects length mismatch', () => {
    expect(timingSafeEqual('aa', 'a')).toBe(false);
    expect(timingSafeEqual('ab', 'ab')).toBe(true);
  });

  it('accepts a valid signature', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
    const secret = 'whsec_test';
    const now = 1_700_000_000;
    const header = await sign(secret, now, body);
    const parsed = await verifyStripeSignature(header, body, secret, now);
    expect(parsed).toEqual(JSON.parse(body));
  });

  it('rejects wrong secret, stale timestamp, and tampered body', async () => {
    const body = JSON.stringify({ id: 'evt_1' });
    const now = 1_700_000_000;
    const header = await sign('whsec_a', now, body);

    await expect(verifyStripeSignature(header, body, 'whsec_b', now)).rejects.toThrow(
      /Signature verification failed/,
    );
    await expect(verifyStripeSignature(header, body, 'whsec_a', now + 10_000)).rejects.toThrow(
      /tolerance/,
    );
    await expect(
      verifyStripeSignature(header, body + 'x', 'whsec_a', now),
    ).rejects.toThrow(/Signature verification failed/);
  });
});
