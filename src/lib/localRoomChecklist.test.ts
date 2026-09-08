import { describe, expect, it, beforeEach } from 'vitest';
import { checklistScopedKey } from './dormChecklist';
import {
  LOCAL_CHECKLIST_CATEGORY_ID,
  LOCAL_CHECKLIST_PRODUCTS_KEY,
  createLocalChecklistProduct,
  findLocalProductByCatalogKind,
  isLocalChecklistProductId,
  keepLocalShoppingListEntries,
  loadLocalChecklistProducts,
  mergeLocalProductsIntoCategories,
  parseImportedShopDetails,
  saveLocalChecklistProducts,
  upsertLocalChecklistProduct,
} from './localRoomChecklist';

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

describe('local room checklist products', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.removeItem(checklistScopedKey(LOCAL_CHECKLIST_PRODUCTS_KEY, ROOM_A));
    localStorage.removeItem(checklistScopedKey(LOCAL_CHECKLIST_PRODUCTS_KEY, ROOM_B));
  });

  it('parses optional Amazon link and price', () => {
    expect(parseImportedShopDetails('', '')).toEqual({ ok: true, empty: true });
    expect(parseImportedShopDetails('not a url', '')).toEqual({
      ok: false,
      error: 'Enter a valid Amazon link.',
    });
    expect(parseImportedShopDetails('', 'abc')).toEqual({
      ok: false,
      error: 'Enter a valid price in USD.',
    });
    const parsed = parseImportedShopDetails('amzn.to/abc', '$29.99');
    expect(parsed.ok).toBe(true);
    if (parsed.ok && !parsed.empty) {
      expect(parsed.details.affiliateUrl).toBe('https://amzn.to/abc');
      expect(parsed.details.priceCents).toBe(2999);
    }
  });

  it('keeps imported shop products per room', () => {
    const product = createLocalChecklistProduct({
      name: 'Thrifted lamp',
      affiliateUrl: 'https://www.amazon.com/dp/B000',
      priceCents: 2499,
      catalogKind: 'custom-lamp',
    });
    expect(isLocalChecklistProductId(product.id)).toBe(true);
    upsertLocalChecklistProduct(product, ROOM_A);
    expect(loadLocalChecklistProducts(ROOM_A)).toEqual([product]);
    expect(loadLocalChecklistProducts(ROOM_B)).toEqual([]);
    expect(findLocalProductByCatalogKind('custom-lamp', ROOM_A)?.id).toBe(product.id);
    expect(findLocalProductByCatalogKind('custom-lamp', ROOM_B)).toBeNull();
  });

  it('merges local products into a Your models group with per-model rows', () => {
    const product = createLocalChecklistProduct({
      name: 'Desk',
      affiliateUrl: 'https://www.amazon.com/dp/B001',
      priceCents: 8000,
      catalogKind: 'custom-desk',
    });
    const merged = mergeLocalProductsIntoCategories(
      [
        {
          id: 'cat-desk',
          slug: 'desk',
          name: 'Desk',
          sortOrder: 1,
          published: true,
          parentId: null,
          imagePath: null,
          imageUrl: null,
          products: [],
        },
      ],
      [product],
    );
    expect(merged).toHaveLength(3);
    const parent = merged.find((c) => c.id === LOCAL_CHECKLIST_CATEGORY_ID);
    expect(parent?.name).toBe('Your models');
    expect(parent?.products).toEqual([]);
    const child = merged.find((c) => c.id === product.id);
    expect(child?.name).toBe('Desk');
    expect(child?.parentId).toBe(LOCAL_CHECKLIST_CATEGORY_ID);
    expect(child?.products).toEqual([{ ...product, categoryId: product.id }]);
  });

  it('keeps local To Buy rows when a remote list overwrites', () => {
    const merged = keepLocalShoppingListEntries(
      [{ productId: 'remote-1', quantity: 1, reviewDone: false }],
      [
        { productId: 'local:abc', quantity: 1, reviewDone: false },
        { productId: 'remote-1', quantity: 2, reviewDone: true },
      ],
    );
    expect(merged).toEqual([
      { productId: 'remote-1', quantity: 1, reviewDone: false },
      { productId: 'local:abc', quantity: 1, reviewDone: false },
    ]);
  });

  it('reloads saved products from storage', () => {
    const product = createLocalChecklistProduct({
      name: 'Chair',
      affiliateUrl: '',
      priceCents: 1500,
      catalogKind: 'custom-chair',
    });
    saveLocalChecklistProducts([product], ROOM_A);
    expect(loadLocalChecklistProducts(ROOM_A)[0]?.name).toBe('Chair');
    expect(loadLocalChecklistProducts(ROOM_A)[0]?.priceCents).toBe(1500);
  });
});
