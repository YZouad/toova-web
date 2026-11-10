import { describe, expect, it } from 'vitest';
import { parseInspoClipUrl } from './inspoClipUrls';

describe('parseInspoClipUrl', () => {
  it('normalizes Instagram reel URLs and strips query params', () => {
    const res = parseInspoClipUrl(
      'https://www.instagram.com/reel/C9abc123XYZ/?igsh=NTc4MTIwNjQ2YQ==',
    );
    expect(res).toEqual({
      ok: true,
      platform: 'instagram',
      canonicalUrl: 'https://www.instagram.com/reel/C9abc123XYZ/',
      inferredCreatorHandle: null,
    });
  });

  it('extracts handle when Instagram reel URL includes username prefix', () => {
    const res = parseInspoClipUrl('https://instagram.com/dormstylist/reels/D12345/');
    expect(res).toEqual({
      ok: true,
      platform: 'instagram',
      canonicalUrl: 'https://www.instagram.com/reel/D12345/',
      inferredCreatorHandle: '@dormstylist',
    });
  });

  it('normalizes TikTok @creator/video/:id URLs', () => {
    const res = parseInspoClipUrl(
      'https://www.tiktok.com/@uchicagodorms/video/7391827391827391827?is_from_webapp=1',
    );
    expect(res).toEqual({
      ok: true,
      platform: 'tiktok',
      canonicalUrl: 'https://www.tiktok.com/@uchicagodorms/video/7391827391827391827',
      inferredCreatorHandle: '@uchicagodorms',
    });
  });

  it('supports short vm.tiktok.com links', () => {
    const res = parseInspoClipUrl('https://vm.tiktok.com/ZMrAbCdEf/');
    expect(res).toEqual({
      ok: true,
      platform: 'tiktok',
      canonicalUrl: 'https://vm.tiktok.com/ZMrAbCdEf/',
      inferredCreatorHandle: null,
    });
  });

  it('rejects unsupported hosts', () => {
    const res = parseInspoClipUrl('https://example.com/reel/123');
    expect(res.ok).toBe(false);
  });
});
