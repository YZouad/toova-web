import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
    },
  },
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-key',
}));

import { setCookieConsent } from './cookieConsent';
import {
  resetAnalyticsRuntimeForTests,
  setAnalyticsIdentityReady,
  setInternalUser,
  trackPageView,
  trackRoomCreated,
} from './analytics';

function installMemoryStorage() {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true });
}

describe('analytics consent and internal-user policy', () => {
  beforeEach(() => {
    installMemoryStorage();
    resetAnalyticsRuntimeForTests();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetAnalyticsRuntimeForTests();
  });

  it('does not enqueue first-party events before consent', async () => {
    trackPageView({ path: '/' });
    await vi.advanceTimersByTimeAsync(50);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fans out after consent when identity is ready', async () => {
    setCookieConsent('accepted');
    setAnalyticsIdentityReady(true);
    setInternalUser(false);
    trackRoomCreated({ room_id: '11111111-1111-4111-8111-111111111111', is_guest: false });
    await vi.advanceTimersByTimeAsync(50);
    expect(fetch).toHaveBeenCalled();
    const body = JSON.parse(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
    expect(body.events.some((row: { name: string }) => row.name === 'room_created')).toBe(true);
    expect(body.events[0].properties.user_id).toBeUndefined();
  });

  it('holds events until admin status is known and drops them for internal users', async () => {
    setCookieConsent('accepted');
    setAnalyticsIdentityReady(false);
    trackPageView({ path: '/gallery' });
    await vi.advanceTimersByTimeAsync(50);
    expect(fetch).not.toHaveBeenCalled();
    setInternalUser(true);
    setAnalyticsIdentityReady(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(fetch).not.toHaveBeenCalled();
  });
});
