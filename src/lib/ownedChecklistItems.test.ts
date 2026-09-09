import { describe, expect, it, beforeEach } from 'vitest';
import { checklistScopedKey } from './dormChecklist';
import {
  OWNED_CHECKLIST_ITEMS_KEY,
  OWNED_CHECKLIST_PRODUCT_PREFIX,
  OWNED_CHECKLIST_TITLE_SUFFIX,
  createOwnedChecklistProduct,
  formatOwnedChecklistDisplayName,
  isOwnedChecklistProductId,
  isRoomLocalProductId,
  loadOwnedChecklistProducts,
  ownedProductIdForCategory,
  parseOwnedPurchaseDetails,
  removeOwnedChecklistProduct,
  upsertOwnedChecklistProduct,
} from './ownedChecklistItems';
import { isLocalChecklistProductId } from './localRoomChecklist';

const ROOM_A = 'room-a';
const ROOM_B = 'room-b';
const CATEGORY_ID = 'cat-lamp';

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

describe('owned checklist items', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.removeItem(checklistScopedKey(OWNED_CHECKLIST_ITEMS_KEY, ROOM_A));
    localStorage.removeItem(checklistScopedKey(OWNED_CHECKLIST_ITEMS_KEY, ROOM_B));
  });

  it('uses stable owned product ids per category', () => {
    expect(ownedProductIdForCategory(CATEGORY_ID)).toBe(`${OWNED_CHECKLIST_PRODUCT_PREFIX}${CATEGORY_ID}`);
    expect(isOwnedChecklistProductId(ownedProductIdForCategory(CATEGORY_ID))).toBe(true);
    expect(isRoomLocalProductId('local:abc')).toBe(true);
    expect(isRoomLocalProductId(ownedProductIdForCategory(CATEGORY_ID))).toBe(true);
    expect(isLocalChecklistProductId(ownedProductIdForCategory(CATEGORY_ID))).toBe(false);
  });

  it('formats display names with the owned suffix', () => {
    expect(formatOwnedChecklistDisplayName('Thrifted lamp')).toBe(
      `Thrifted lamp ${OWNED_CHECKLIST_TITLE_SUFFIX}`,
    );
    const product = createOwnedChecklistProduct({
      categoryId: CATEGORY_ID,
      name: 'Thrifted lamp',
      affiliateUrl: 'https://www.amazon.com/dp/B000',
      priceCents: 2499,
    });
    expect(product.name).toBe(`Thrifted lamp ${OWNED_CHECKLIST_TITLE_SUFFIX}`);
    expect(product.categoryId).toBe(CATEGORY_ID);
    expect(product.priceCents).toBe(2499);
  });

  it('parses required name and price with optional link', () => {
    expect(parseOwnedPurchaseDetails('', '', '')).toEqual({
      ok: false,
      error: 'Enter a name for this item.',
    });
    expect(parseOwnedPurchaseDetails('Lamp', '', '')).toEqual({
      ok: false,
      error: 'Enter a price in USD.',
    });
    expect(parseOwnedPurchaseDetails('Lamp', 'not a url', '12')).toEqual({
      ok: false,
      error: 'Enter a valid Amazon link.',
    });
    expect(parseOwnedPurchaseDetails('Lamp', '', '29.99')).toEqual({
      ok: true,
      name: 'Lamp',
      affiliateUrl: '',
      priceCents: 2999,
    });
    expect(parseOwnedPurchaseDetails('Lamp', 'amzn.to/abc', '29.99')).toEqual({
      ok: true,
      name: 'Lamp',
      affiliateUrl: 'https://amzn.to/abc',
      priceCents: 2999,
    });
  });

  it('keeps owned products per room', () => {
    const product = createOwnedChecklistProduct({
      categoryId: CATEGORY_ID,
      name: 'Desk lamp',
      affiliateUrl: '',
      priceCents: 1800,
    });
    upsertOwnedChecklistProduct(product, ROOM_A);
    expect(loadOwnedChecklistProducts(ROOM_A)).toEqual([product]);
    expect(loadOwnedChecklistProducts(ROOM_B)).toEqual([]);
    removeOwnedChecklistProduct(CATEGORY_ID, ROOM_A);
    expect(loadOwnedChecklistProducts(ROOM_A)).toEqual([]);
  });
});
