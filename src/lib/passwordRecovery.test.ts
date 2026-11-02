import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPasswordRecoveryFlag,
  markPasswordRecovery,
  readPasswordRecoveryFlag,
  shouldOpenResetPasswordRoute,
} from './passwordRecovery';

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

describe('passwordRecovery flag', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('is unset by default', () => {
    expect(readPasswordRecoveryFlag()).toBe(false);
  });

  it('persists across reads until cleared', () => {
    markPasswordRecovery();
    expect(readPasswordRecoveryFlag()).toBe(true);
    clearPasswordRecoveryFlag();
    expect(readPasswordRecoveryFlag()).toBe(false);
  });
});

describe('shouldOpenResetPasswordRoute', () => {
  it('opens the reset screen once when recovery starts off that route', () => {
    expect(shouldOpenResetPasswordRoute(true, false, false)).toEqual({
      open: true,
      alreadyOpened: true,
    });
  });

  it('does not send the user back after they leave the reset screen', () => {
    expect(shouldOpenResetPasswordRoute(true, false, true)).toEqual({
      open: false,
      alreadyOpened: true,
    });
    expect(shouldOpenResetPasswordRoute(true, true, false)).toEqual({
      open: false,
      alreadyOpened: true,
    });
  });

  it('clears the latch when recovery ends', () => {
    expect(shouldOpenResetPasswordRoute(false, false, true)).toEqual({
      open: false,
      alreadyOpened: false,
    });
  });
});
