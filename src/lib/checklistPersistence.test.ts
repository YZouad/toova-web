import { describe, expect, it, beforeEach } from 'vitest';
import {
  loadCheckedIds,
  saveCheckedIds,
  loadLocalShoppingList,
  saveLocalShoppingList,
  CHECKLIST_CHECKED_KEY,
  SHOPPING_LIST_KEY,
} from './dormChecklist';

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

describe('checklist local persistence', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.removeItem(CHECKLIST_CHECKED_KEY);
    localStorage.removeItem(SHOPPING_LIST_KEY);
  });

  it('keeps checked category ids across reloads', () => {
    saveCheckedIds(new Set(['cat-a', 'cat-b']));
    expect([...loadCheckedIds()].sort()).toEqual(['cat-a', 'cat-b']);
  });

  it('keeps To Buy entries across reloads', () => {
    saveLocalShoppingList([
      { productId: 'prod-1', quantity: 2, reviewDone: false },
    ]);
    expect(loadLocalShoppingList()).toEqual([
      { productId: 'prod-1', quantity: 2, reviewDone: false },
    ]);
  });
});
