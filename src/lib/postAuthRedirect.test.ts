import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumePostAuthRedirect, markPostAuthRedirect } from './postAuthRedirect';

describe('postAuthRedirect', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('marks and consumes once', () => {
    markPostAuthRedirect();
    expect(consumePostAuthRedirect()).toBe(true);
    expect(consumePostAuthRedirect()).toBe(false);
  });

  it('expires after one hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    markPostAuthRedirect();
    vi.setSystemTime(new Date('2026-01-01T01:00:01Z'));
    expect(consumePostAuthRedirect()).toBe(false);
  });
});
