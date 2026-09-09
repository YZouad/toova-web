/** Room-scoped "I already have this" purchase details for checklist categories. */

import { checklistScopedKey, type CuratedProduct } from './dormChecklist';
import {
  isLocalChecklistProductId,
  parseImportedShopDetails,
  parseShopPriceDollarsToCents,
} from './localRoomChecklist';

export const OWNED_CHECKLIST_ITEMS_KEY = 'toova-owned-checklist-items';
export const OWNED_CHECKLIST_PRODUCT_PREFIX = 'owned:';
export const OWNED_CHECKLIST_TITLE_SUFFIX = '(I already have this)';

export function isOwnedChecklistProductId(id: string): boolean {
  return id.startsWith(OWNED_CHECKLIST_PRODUCT_PREFIX);
}

export function isRoomLocalProductId(id: string): boolean {
  return isLocalChecklistProductId(id) || isOwnedChecklistProductId(id);
}

export function ownedProductIdForCategory(categoryId: string): string {
  return `${OWNED_CHECKLIST_PRODUCT_PREFIX}${categoryId}`;
}

export function formatOwnedChecklistDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return OWNED_CHECKLIST_TITLE_SUFFIX;
  if (trimmed.endsWith(OWNED_CHECKLIST_TITLE_SUFFIX)) return trimmed;
  return `${trimmed} ${OWNED_CHECKLIST_TITLE_SUFFIX}`;
}

export type ParsedOwnedPurchaseDetails =
  | { ok: true; name: string; affiliateUrl: string; priceCents: number }
  | { ok: false; error: string };

/** Validate name (required), price (required), and optional shop link. */
export function parseOwnedPurchaseDetails(
  nameRaw: string,
  urlRaw: string,
  priceRaw: string,
): ParsedOwnedPurchaseDetails {
  const name = nameRaw.trim();
  if (!name) return { ok: false, error: 'Enter a name for this item.' };

  const priceTrimmed = priceRaw.trim();
  if (!priceTrimmed) return { ok: false, error: 'Enter a price in USD.' };
  const priceCents = parseShopPriceDollarsToCents(priceTrimmed);
  if (priceCents == null) return { ok: false, error: 'Enter a valid price in USD.' };

  const urlTrimmed = urlRaw.trim();
  if (!urlTrimmed) {
    return { ok: true, name, affiliateUrl: '', priceCents };
  }

  const parsed = parseImportedShopDetails(urlTrimmed, '');
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.empty) return { ok: true, name, affiliateUrl: '', priceCents };
  return { ok: true, name, affiliateUrl: parsed.details.affiliateUrl, priceCents };
}

function requireRoomKey(roomId: string | null | undefined): string | null {
  const id = roomId?.trim();
  if (!id) return null;
  return checklistScopedKey(OWNED_CHECKLIST_ITEMS_KEY, id);
}

function parseOwnedProduct(row: unknown): CuratedProduct | null {
  if (!row || typeof row !== 'object') return null;
  const o = row as Record<string, unknown>;
  if (typeof o.id !== 'string' || !isOwnedChecklistProductId(o.id)) return null;
  if (typeof o.categoryId !== 'string' || !o.categoryId.trim()) return null;
  if (typeof o.name !== 'string' || !o.name.trim()) return null;
  const priceCents =
    o.priceCents == null || o.priceCents === '' ? null : Number(o.priceCents);
  if (priceCents == null || !Number.isFinite(priceCents)) return null;
  const affiliateUrl = typeof o.affiliateUrl === 'string' ? o.affiliateUrl : '';
  return {
    id: o.id,
    categoryId: o.categoryId.trim(),
    slug: typeof o.slug === 'string' ? o.slug : o.id,
    name: o.name.trim(),
    description: typeof o.description === 'string' ? o.description : '',
    retailer: affiliateUrl.trim() ? 'Amazon' : 'Shop',
    affiliateUrl,
    priceCents: Math.round(priceCents),
    currency: typeof o.currency === 'string' && o.currency.trim() ? o.currency : 'USD',
    imagePath: null,
    imageUrl: null,
    sortOrder: typeof o.sortOrder === 'number' ? o.sortOrder : 0,
    published: true,
    lastVerifiedAt: null,
    placeBuiltinKind: null,
    placeCatalogKind: null,
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

export function createOwnedChecklistProduct(input: {
  categoryId: string;
  name: string;
  affiliateUrl: string;
  priceCents: number;
}): CuratedProduct {
  const categoryId = input.categoryId.trim();
  const id = ownedProductIdForCategory(categoryId);
  return {
    id,
    categoryId,
    slug: id,
    name: formatOwnedChecklistDisplayName(input.name),
    description: '',
    retailer: input.affiliateUrl.trim() ? 'Amazon' : 'Shop',
    affiliateUrl: input.affiliateUrl,
    priceCents: Math.round(input.priceCents),
    currency: 'USD',
    imagePath: null,
    imageUrl: null,
    sortOrder: Date.now(),
    published: true,
    lastVerifiedAt: null,
    placeBuiltinKind: null,
    placeCatalogKind: null,
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

export function loadOwnedChecklistProducts(roomId?: string | null): CuratedProduct[] {
  try {
    const key = requireRoomKey(roomId);
    if (!key) return [];
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseOwnedProduct).filter((p): p is CuratedProduct => p != null);
  } catch {
    return [];
  }
}

export function saveOwnedChecklistProducts(
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

export function upsertOwnedChecklistProduct(
  product: CuratedProduct,
  roomId?: string | null,
): CuratedProduct[] {
  const current = loadOwnedChecklistProducts(roomId);
  const next = [...current.filter((p) => p.categoryId !== product.categoryId), product];
  saveOwnedChecklistProducts(next, roomId);
  return next;
}

export function removeOwnedChecklistProduct(
  categoryId: string,
  roomId?: string | null,
): CuratedProduct[] {
  const current = loadOwnedChecklistProducts(roomId);
  const next = current.filter((p) => p.categoryId !== categoryId);
  saveOwnedChecklistProducts(next, roomId);
  return next;
}

export function findOwnedProductByCategoryId(
  categoryId: string,
  roomId?: string | null,
): CuratedProduct | null {
  const id = categoryId.trim();
  if (!id) return null;
  return loadOwnedChecklistProducts(roomId).find((p) => p.categoryId === id) ?? null;
}
