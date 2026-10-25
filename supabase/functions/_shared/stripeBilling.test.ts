/** @vitest-environment node */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { decodeAccessJwtClaims, HttpError, requireUserId } from './stripeBilling.ts';

beforeAll(() => {
  if (typeof (globalThis as { Deno?: unknown }).Deno === 'undefined') {
    Object.defineProperty(globalThis, 'Deno', {
      value: {
        env: {
          get: (name: string) => process.env[name],
        },
      },
      configurable: true,
    });
  }
});

function b64url(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
});

describe('decodeAccessJwtClaims', () => {
  it('reads authenticated user id claims without verifying signature', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `hdr.${b64url({ sub: 'user-abc', role: 'authenticated', exp })}.sig`;
    expect(decodeAccessJwtClaims(token)).toMatchObject({
      sub: 'user-abc',
      role: 'authenticated',
      exp,
    });
  });

  it('returns null for non-JWT bearer values', () => {
    expect(decodeAccessJwtClaims('sb_publishable_not_a_jwt')).toBeNull();
  });
});

describe('requireUserId', () => {
  it('rejects forged tokens that Auth API does not accept', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"msg":"invalid"}', { status: 401 })),
    );
    const forged = `hdr.${b64url({
      sub: 'attacker',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.fakesig`;
    await expect(
      requireUserId(new Request('https://fn', {
        headers: { authorization: `Bearer ${forged}` },
      })),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it('accepts a token verified by Auth /user', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `hdr.${b64url({ sub: 'user-abc', role: 'authenticated', exp })}.sig`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'user-abc', role: 'authenticated' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(
      requireUserId(new Request('https://fn', {
        headers: { authorization: `Bearer ${token}` },
      })),
    ).resolves.toBe('user-abc');
  });
});
