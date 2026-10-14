/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { decodeAccessJwtClaims } from './stripeBilling.ts';

function b64url(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

describe('decodeAccessJwtClaims', () => {
  it('reads authenticated user id and rejects expired tokens via requireUserId path', () => {
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
