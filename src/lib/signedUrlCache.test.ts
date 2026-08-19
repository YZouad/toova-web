import { afterEach, describe, expect, it } from 'vitest';
import {
  SIGNED_URL_CACHE_KEY,
  SIGNED_URL_REFRESH_SKEW_MS,
  alignedExpiresIn,
  clearSignedUrlCache,
  readCachedSignedUrl,
  readCachedSignedUrlMap,
  setSignedUrlCacheStorageForTests,
  signedUrlCacheKey,
  writeCachedSignedUrl,
  writeCachedSignedUrlMap,
} from './signedUrlCache';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

afterEach(() => {
  clearSignedUrlCache();
  setSignedUrlCacheStorageForTests(null);
});

describe('alignedExpiresIn', () => {
  it('snaps 1h requests to the next UTC hour', () => {
    const now = Date.parse('2026-08-17T14:10:00.000Z');
    const aligned = alignedExpiresIn(60 * 60, now);
    expect(aligned.windowSec).toBe(3600);
    expect(aligned.expiresAtMs).toBe(Date.parse('2026-08-17T15:00:00.000Z'));
    expect(aligned.expiresIn).toBe(50 * 60);
  });

  it('skips to the following window when too close to the boundary', () => {
    const now = Date.parse('2026-08-17T14:59:00.000Z');
    const aligned = alignedExpiresIn(60 * 60, now);
    expect(aligned.expiresAtMs).toBe(Date.parse('2026-08-17T16:00:00.000Z'));
  });

  it('uses a 24h window for long TTLs', () => {
    const now = Date.parse('2026-08-17T10:00:00.000Z');
    const aligned = alignedExpiresIn(60 * 60 * 24, now);
    expect(aligned.windowSec).toBe(60 * 60 * 24);
    expect(aligned.expiresAtMs).toBe(Date.parse('2026-08-18T00:00:00.000Z'));
  });
});

describe('signed URL cache', () => {
  it('reuses a stored URL until near expiry', () => {
    const store = new MemoryStorage();
    setSignedUrlCacheStorageForTests(store);
    const key = signedUrlCacheKey('model-files', 'u1/a.glb');
    const exp = Date.now() + 60 * 60 * 1000;
    writeCachedSignedUrl(key, 'https://example.test/a?token=1', exp);

    expect(readCachedSignedUrl(key)).toBe('https://example.test/a?token=1');
    expect(store.getItem(SIGNED_URL_CACHE_KEY)).toContain('token=1');

    setSignedUrlCacheStorageForTests(store);
    expect(readCachedSignedUrl(key)).toBe('https://example.test/a?token=1');
  });

  it('drops entries inside the refresh skew', () => {
    const store = new MemoryStorage();
    setSignedUrlCacheStorageForTests(store);
    const key = signedUrlCacheKey('model-files', 'u1/a.glb');
    writeCachedSignedUrl(
      key,
      'https://example.test/a?token=old',
      Date.now() + SIGNED_URL_REFRESH_SKEW_MS - 1000,
    );
    expect(readCachedSignedUrl(key)).toBeNull();
  });

  it('stores a share URL map as one cache entry', () => {
    const store = new MemoryStorage();
    setSignedUrlCacheStorageForTests(store);
    const exp = Date.now() + 60 * 60 * 1000;
    writeCachedSignedUrlMap('share:tok', { 'u1/a.glb': 'https://example.test/a' }, exp);
    expect(readCachedSignedUrlMap('share:tok')).toEqual({
      'u1/a.glb': 'https://example.test/a',
    });
  });

  it('clearSignedUrlCache wipes memory and storage', () => {
    const store = new MemoryStorage();
    setSignedUrlCacheStorageForTests(store);
    const key = signedUrlCacheKey('model-files', 'u1/a.glb');
    writeCachedSignedUrl(key, 'https://example.test/a?token=1', Date.now() + 3_600_000);
    clearSignedUrlCache();
    expect(readCachedSignedUrl(key)).toBeNull();
    expect(store.getItem(SIGNED_URL_CACHE_KEY)).toBeNull();
  });
});
