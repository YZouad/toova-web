/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  allowedAppOrigins,
  canonicalAppOrigin,
  resolveBillingReturnUrl,
  sameOriginAppUrl,
  withCheckoutFlag,
} from './appUrls';

describe('appUrls', () => {
  it('defaults to toova.net origins', () => {
    expect(allowedAppOrigins(() => undefined)).toEqual([
      'https://toova.net',
      'https://www.toova.net',
    ]);
  });

  it('merges BILLING_ALLOWED_ORIGINS without duplicates', () => {
    const env = (name: string) =>
      name === 'BILLING_ALLOWED_ORIGINS'
        ? 'http://localhost:5173,https://toova.net,http://127.0.0.1:5173'
        : undefined;
    expect(allowedAppOrigins(env)).toEqual([
      'https://toova.net',
      'https://www.toova.net',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });

  it('rejects cross-origin and credentialed URLs', () => {
    const allowed = ['https://toova.net'];
    expect(sameOriginAppUrl('https://evil.example/phish', allowed)).toBeNull();
    expect(sameOriginAppUrl('https://user:pass@toova.net/', allowed)).toBeNull();
    expect(sameOriginAppUrl('javascript:alert(1)', allowed)).toBeNull();
    expect(sameOriginAppUrl('https://toova.net/pricing', allowed)).toBe(
      'https://toova.net/pricing',
    );
  });

  it('falls back to canonical origin when candidate is unsafe', () => {
    const env = () => undefined;
    expect(canonicalAppOrigin(env)).toBe('https://toova.net');
    expect(resolveBillingReturnUrl('https://evil.example/', env)).toBe(
      'https://toova.net/',
    );
  });

  it('adds checkout flags', () => {
    expect(withCheckoutFlag('https://toova.net/app', 'success')).toBe(
      'https://toova.net/app?checkout=success',
    );
  });
});
