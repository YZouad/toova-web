import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkoutReturnMatchesLocation,
  checkoutReturnUrls,
  clearCheckoutReturn,
  consumeCheckoutReturn,
  isPersistableRoomId,
  pendingDesignerCheckoutReturn,
  rememberCheckoutReturn,
  setCheckoutReturnContext,
} from './checkoutReturn';

describe('checkoutReturnUrls', () => {
  it('keeps the current page and marks success or cancel', () => {
    expect(checkoutReturnUrls('https://toova.net/pricing')).toEqual({
      successUrl: 'https://toova.net/pricing?checkout=success',
      cancelUrl: 'https://toova.net/pricing?checkout=cancel',
    });
  });

  it('replaces an existing checkout flag', () => {
    expect(checkoutReturnUrls('http://localhost:5173/?checkout=success').cancelUrl).toBe(
      'http://localhost:5173/?checkout=cancel',
    );
  });
});

describe('checkout return snapshot', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    setCheckoutReturnContext(null);
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    vi.stubGlobal('window', {
      location: new URL('http://localhost:5173/'),
      history: { replaceState: vi.fn() },
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('remembers the designer room for this tab', () => {
    setCheckoutReturnContext({
      screen: 'designer',
      roomId: '11111111-1111-4111-8111-111111111111',
      roomName: 'My dorm',
      isOwner: true,
    });
    rememberCheckoutReturn();
    const ret = consumeCheckoutReturn();
    expect(ret?.path).toBe('/');
    expect(ret?.screen).toBe('designer');
    expect(ret?.roomName).toBe('My dorm');
    expect(consumeCheckoutReturn()).toBeNull();
  });

  it('treats a designer room on / as a pending restore', () => {
    setCheckoutReturnContext({
      screen: 'designer',
      roomId: '11111111-1111-4111-8111-111111111111',
      roomName: 'My dorm',
      isOwner: true,
    });
    rememberCheckoutReturn();
    expect(pendingDesignerCheckoutReturn('/')).toBe(true);
    expect(checkoutReturnMatchesLocation(
      { path: '/', at: Date.now() },
      '/',
    )).toBe(true);
  });

  it('does not restore a guest or starter workspace id', () => {
    expect(isPersistableRoomId('guest-123')).toBe(false);
    expect(isPersistableRoomId('starter-edit-bedroom')).toBe(false);
    expect(isPersistableRoomId('11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it('expires after thirty minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    setCheckoutReturnContext({ screen: 'dashboard' });
    rememberCheckoutReturn();
    vi.setSystemTime(new Date('2026-01-01T00:31:00Z'));
    expect(consumeCheckoutReturn()).toBeNull();
  });

  it('clears a snapshot explicitly', () => {
    setCheckoutReturnContext({ screen: 'dashboard' });
    rememberCheckoutReturn();
    clearCheckoutReturn();
    expect(pendingDesignerCheckoutReturn('/')).toBe(false);
  });
});
