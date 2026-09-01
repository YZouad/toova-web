import { describe, expect, it, beforeEach } from 'vitest';
import {
  loadCheckedIds,
  loadLocalMoveInBudgetCents,
  loadLocalResolutions,
  loadLocalShoppingList,
  saveCheckedIds,
  saveLocalMoveInBudgetCents,
  saveLocalResolutions,
  saveLocalShoppingList,
  CHECKLIST_CHECKED_KEY,
  CHECKLIST_RESOLUTION_KEY,
  MOVE_IN_BUDGET_KEY,
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
    localStorage.removeItem(CHECKLIST_RESOLUTION_KEY);
    localStorage.removeItem(MOVE_IN_BUDGET_KEY);
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

  it('keeps have/skip resolutions across reloads', () => {
    saveLocalResolutions(new Map([['cat-a', 'have'], ['cat-b', 'skip']]));
    expect(loadLocalResolutions().get('cat-a')).toBe('have');
    expect(loadLocalResolutions().get('cat-b')).toBe('skip');
  });

  it('keeps move-in budget across reloads', () => {
    saveLocalMoveInBudgetCents(100000);
    expect(loadLocalMoveInBudgetCents()).toBe(100000);
    saveLocalMoveInBudgetCents(null);
    expect(loadLocalMoveInBudgetCents()).toBeNull();
  });
});
