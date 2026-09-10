import { beforeEach, describe, expect, it } from 'vitest';
import {
  COOKIE_CONSENT_KEY,
  getCookieConsent,
  hasAcceptedAnalytics,
  setCookieConsent,
} from './cookieConsent';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  });
}

describe('cookieConsent', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('returns null when no choice has been stored', () => {
    expect(getCookieConsent()).toBeNull();
    expect(hasAcceptedAnalytics()).toBe(false);
  });

  it('persists acceptance and reads it back', () => {
    setCookieConsent('accepted');
    expect(localStorage.getItem(COOKIE_CONSENT_KEY)).toBe('accepted');
    expect(getCookieConsent()).toBe('accepted');
    expect(hasAcceptedAnalytics()).toBe(true);
  });

  it('persists rejection and does not treat it as analytics consent', () => {
    setCookieConsent('rejected');
    expect(getCookieConsent()).toBe('rejected');
    expect(hasAcceptedAnalytics()).toBe(false);
  });

  it('ignores unknown stored values', () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'maybe');
    expect(getCookieConsent()).toBeNull();
    expect(hasAcceptedAnalytics()).toBe(false);
  });
});
