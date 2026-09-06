/** Room-scoped local checklist products created when a user imports a model. */

import {
  checklistScopedKey,
  type ChecklistCategoryWithProducts,
  type CuratedProduct,
  type ShoppingListEntry,
} from './dormChecklist';

export const LOCAL_CHECKLIST_PRODUCTS_KEY = 'toova-local-checklist-products';
export const LOCAL_CHECKLIST_CATEGORY_ID = 'local-your-models';
export const LOCAL_CHECKLIST_CATEGORY_SLUG = 'your-models';
export const LOCAL_CHECKLIST_PRODUCT_PREFIX = 'local:';

export interface ImportedShopDetails {
  affiliateUrl: string;
  priceCents: number | null;
}

export type ParsedImportedShopDetails =
  | { ok: true; empty: true }
  | { ok: true; empty: false; details: ImportedShopDetails }
  | { ok: false; error: string };

export function isLocalChecklistProductId(id: string): boolean {
  return id.startsWith(LOCAL_CHECKLIST_PRODUCT_PREFIX);
}

export function normalizeShopUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProto);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseShopPriceDollarsToCents(dollars: string): number | null {
  const cleaned = dollars.trim().replace(/[$,]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Validate optional Amazon URL + price from the import form. */
export function parseImportedShopDetails(
  urlRaw: string,
  priceRaw: string,
): ParsedImportedShopDetails {
  const urlTrimmed = urlRaw.trim();
  const priceTrimmed = priceRaw.trim();
  if (!urlTrimmed && !priceTrimmed) return { ok: true, empty: true };

  let affiliateUrl = '';
  if (urlTrimmed) {
    const normalized = normalizeShopUrl(urlTrimmed);
    if (!normalized) return { ok: false, error: 'Enter a valid Amazon link.' };
    affiliateUrl = normalized;
  }

  let priceCents: number | null = null;
  if (priceTrimmed) {
    priceCents = parseShopPriceDollarsToCents(priceTrimmed);
    if (priceCents == null) return { ok: false, error: 'Enter a valid price in USD.' };
  }

  return { ok: true, empty: false, details: { affiliateUrl, priceCents } };
}

function requireRoomKey(roomId: string | null | undefined): string | null {
  const id = roomId?.trim();
  if (!id) return null;
  return checklistScopedKey(LOCAL_CHECKLIST_PRODUCTS_KEY, id);
}

function parseLocalProduct(row: unknown): CuratedProduct | null {
  if (!row || typeof row !== 'object') return null;
  const o = row as Record<string, unknown>;
  if (typeof o.id !== 'string' || !isLocalChecklistProductId(o.id)) return null;
  if (typeof o.name !== 'string' || !o.name.trim()) return null;
  const priceCents =
    o.priceCents == null || o.priceCents === ''
      ? null
      : Number(o.priceCents);
  return {
    id: o.id,
    categoryId: LOCAL_CHECKLIST_CATEGORY_ID,
    slug: typeof o.slug === 'string' ? o.slug : o.id,
    name: o.name.trim(),
    description: typeof o.description === 'string' ? o.description : '',
    retailer: typeof o.retailer === 'string' && o.retailer.trim() ? o.retailer : 'Amazon',
    affiliateUrl: typeof o.affiliateUrl === 'string' ? o.affiliateUrl : '',
    priceCents: priceCents != null && Number.isFinite(priceCents) ? Math.round(priceCents) : null,
    currency: typeof o.currency === 'string' && o.currency.trim() ? o.currency : 'USD',
    imagePath: typeof o.imagePath === 'string' ? o.imagePath : null,
    imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl : null,
    sortOrder: typeof o.sortOrder === 'number' ? o.sortOrder : 0,
    published: o.published !== false,
    lastVerifiedAt: typeof o.lastVerifiedAt === 'string' ? o.lastVerifiedAt : null,
    placeBuiltinKind: typeof o.placeBuiltinKind === 'string' ? o.placeBuiltinKind : null,
    placeCatalogKind: typeof o.placeCatalogKind === 'string' ? o.placeCatalogKind : null,
    placeHangingKind: null,
    placeBeddingKind: null,
    brand: typeof o.brand === 'string' ? o.brand : null,
    featureBullets: Array.isArray(o.featureBullets)
      ? o.featureBullets.filter((x): x is string => typeof x === 'string')
      : [],
    dimensionsText: typeof o.dimensionsText === 'string' ? o.dimensionsText : null,
    rating: typeof o.rating === 'number' ? o.rating : null,
    reviewCount: typeof o.reviewCount === 'number' ? o.reviewCount : null,
    availability: typeof o.availability === 'string' ? o.availability : null,
  };
}

export function loadLocalChecklistProducts(roomId?: string | null): CuratedProduct[] {
  try {
    const key = requireRoomKey(roomId);
    if (!key) return [];
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseLocalProduct).filter((p): p is CuratedProduct => p != null);
  } catch {
    return [];
  }
}

export function saveLocalChecklistProducts(
  products: CuratedProduct[],
  roomId?: string | null,
): void {
  try {
    const key = requireRoomKey(roomId);
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(products));
  } catch {
    /* ignore quota / private mode */
  }
}

export function createLocalChecklistProduct(input: {
  name: string;
  description?: string;
  affiliateUrl: string;
  priceCents: number | null;
  catalogKind: string;
  imageUrl?: string | null;
}): CuratedProduct {
  const id = `${LOCAL_CHECKLIST_PRODUCT_PREFIX}${crypto.randomUUID()}`;
  return {
    id,
    categoryId: LOCAL_CHECKLIST_CATEGORY_ID,
    slug: id,
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    retailer: 'Amazon',
    affiliateUrl: input.affiliateUrl,
    priceCents: input.priceCents,
    currency: 'USD',
    imagePath: null,
    imageUrl: input.imageUrl ?? null,
    sortOrder: Date.now(),
    published: true,
    lastVerifiedAt: null,
    placeBuiltinKind: null,
    placeCatalogKind: input.catalogKind,
    placeHangingKind: null,
    placeBeddingKind: null,
    brand: null,
    featureBullets: [],
    dimensionsText: null,
    rating: null,
    reviewCount: null,
    availability: null,
  };
}

export function upsertLocalChecklistProduct(
  product: CuratedProduct,
  roomId?: string | null,
): CuratedProduct[] {
  const current = loadLocalChecklistProducts(roomId);
  const next = [...current.filter((p) => p.id !== product.id), product];
  saveLocalChecklistProducts(next, roomId);
  return next;
}

export function findLocalProductByCatalogKind(
  catalogKind: string,
  roomId?: string | null,
): CuratedProduct | null {
  const kind = catalogKind.trim();
  if (!kind) return null;
  return (
    loadLocalChecklistProducts(roomId).find((p) => p.placeCatalogKind === kind) ?? null
  );
}

export function mergeLocalProductsIntoCategories(
  categories: ChecklistCategoryWithProducts[],
  localProducts: CuratedProduct[],
): ChecklistCategoryWithProducts[] {
  const withoutLocal = categories.filter((c) => c.id !== LOCAL_CHECKLIST_CATEGORY_ID);
  if (localProducts.length === 0) return withoutLocal;
  const cover = localProducts.find((p) => p.imageUrl)?.imageUrl ?? null;
  const localCategory: ChecklistCategoryWithProducts = {
    id: LOCAL_CHECKLIST_CATEGORY_ID,
    slug: LOCAL_CHECKLIST_CATEGORY_SLUG,
    name: 'Your models',
    sortOrder: 10_000,
    published: true,
    parentId: null,
    imagePath: null,
    imageUrl: cover,
    products: localProducts,
  };
  return [...withoutLocal, localCategory];
}

/** Keep local-only To Buy rows when a remote shopping list overwrites storage. */
export function keepLocalShoppingListEntries(
  remoteList: ShoppingListEntry[],
  localList: ShoppingListEntry[],
): ShoppingListEntry[] {
  const remoteIds = new Set(remoteList.map((e) => e.productId));
  const extras = localList.filter(
    (e) => isLocalChecklistProductId(e.productId) && !remoteIds.has(e.productId),
  );
  return extras.length ? [...remoteList, ...extras] : remoteList;
}
