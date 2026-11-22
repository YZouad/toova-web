import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, CONTENT_SECURITY_POLICY_META } from './securityHeaders';

describe('content security policy', () => {
  it('lets GLTFLoader fetch embedded blob textures', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self' blob:");
    expect(CONTENT_SECURITY_POLICY_META).toContain("connect-src 'self' blob:");
  });

  it('allows Cloudflare Web Analytics without opening githack', () => {
    expect(CONTENT_SECURITY_POLICY).toContain('https://static.cloudflareinsights.com');
    expect(CONTENT_SECURITY_POLICY).toContain('https://cloudflareinsights.com');
    expect(CONTENT_SECURITY_POLICY).not.toContain('githack');
  });

  it('keeps frame-ancestors on the header and off the meta policy', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'self'");
    expect(CONTENT_SECURITY_POLICY_META).not.toContain('frame-ancestors');
  });
});
