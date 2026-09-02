import { describe, expect, it, beforeEach } from 'vitest';
import {
  checklistScopedKey,
  loadCheckedIds,
  loadLocalMoveInBudgetCents,
  loadLocalResolutions,
  loadLocalShoppingList,
  saveCheckedIds,
  saveLocalMoveInBudgetCents,
  saveLocalResolutions,
  saveLocalShoppingList,
  CHECKLIST_CHECKED_KEY,
  CHECKLIST_LEGACY_MIGRATED_KEY,
  CHECKLIST_RESOLUTION_KEY,
  MOVE_IN_BUDGET_KEY,
  SHOPPING_LIST_KEY,
} from './dormChecklist';

const ROOM_A = 'room-a';
const ROOM_B = 'room-b';

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
    localStorage.removeItem(CHECKLIST_LEGACY_MIGRATED_KEY);
    localStorage.removeItem(checklistScopedKey(CHECKLIST_CHECKED_KEY, ROOM_A));
    localStorage.removeItem(checklistScopedKey(CHECKLIST_CHECKED_KEY, ROOM_B));
    localStorage.removeItem(checklistScopedKey(SHOPPING_LIST_KEY, ROOM_A));
    localStorage.removeItem(checklistScopedKey(SHOPPING_LIST_KEY, ROOM_B));
  });

  it('keeps checked category ids across reloads per room', () => {
    saveCheckedIds(new Set(['cat-a', 'cat-b']), ROOM_A);
    expect([...loadCheckedIds(ROOM_A)].sort()).toEqual(['cat-a', 'cat-b']);
    expect(loadCheckedIds(ROOM_B).size).toBe(0);
  });

  it('keeps To Buy entries across reloads per room', () => {
    saveLocalShoppingList([{ productId: 'prod-1', quantity: 2, reviewDone: false }], ROOM_A);
    saveLocalShoppingList([{ productId: 'prod-2', quantity: 1, reviewDone: false }], ROOM_B);
    expect(loadLocalShoppingList(ROOM_A)).toEqual([
      { productId: 'prod-1', quantity: 2, reviewDone: false },
    ]);
    expect(loadLocalShoppingList(ROOM_B)).toEqual([
      { productId: 'prod-2', quantity: 1, reviewDone: false },
    ]);
  });

  it('keeps have/skip resolutions across reloads per room', () => {
    saveLocalResolutions(new Map([['cat-a', 'have'], ['cat-b', 'skip']]), ROOM_A);
    expect(loadLocalResolutions(ROOM_A).get('cat-a')).toBe('have');
    expect(loadLocalResolutions(ROOM_A).get('cat-b')).toBe('skip');
    expect(loadLocalResolutions(ROOM_B).size).toBe(0);
  });

  it('keeps move-in budget across reloads per room', () => {
    saveLocalMoveInBudgetCents(100000, ROOM_A);
    saveLocalMoveInBudgetCents(50000, ROOM_B);
    expect(loadLocalMoveInBudgetCents(ROOM_A)).toBe(100000);
    expect(loadLocalMoveInBudgetCents(ROOM_B)).toBe(50000);
    saveLocalMoveInBudgetCents(null, ROOM_A);
    expect(loadLocalMoveInBudgetCents(ROOM_A)).toBeNull();
  });

  it('migrates legacy global keys into the first opened room once', () => {
    localStorage.setItem(
      SHOPPING_LIST_KEY,
      JSON.stringify([{ productId: 'legacy-prod', quantity: 1, reviewDone: false }]),
    );
    expect(loadLocalShoppingList(ROOM_A)).toEqual([
      { productId: 'legacy-prod', quantity: 1, reviewDone: false },
    ]);
    expect(loadLocalShoppingList(ROOM_B)).toEqual([]);
  });
});
