/** Shopping checklist / curated product types and localStorage helpers. */

import { resolveBeddingConfig } from './bedding/config';
import type { BeddingConfig } from './bedding/types';
import type { HangingDecorKind } from './hangingDecorGeometry';

/** Bed inspector layers linked to checklist categories. */
export type BeddingPlacementKind = 'sheets' | 'comforter' | 'pillow';

export interface ChecklistCategory {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  published: boolean;
  /** Null for top-level gallery groups; set for leaf subcategories. */
  parentId: string | null;
  imagePath: string | null;
  /** Public URL when image_path is set. */
  imageUrl: string | null;
}

export interface CuratedProduct {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  description: string;
  retailer: string;
  affiliateUrl: string;
  priceCents: number | null;
  currency: string;
  imagePath: string | null;
  /** Public URL when image_path is set (bucket is public). */
  imageUrl: string | null;
  sortOrder: number;
  published: boolean;
  lastVerifiedAt: string | null;
  placeBuiltinKind: string | null;
  placeCatalogKind: string | null;
  /** Procedural hanging draw feature (string lights / leaves). */
  placeHangingKind: HangingDecorKind | null;
  /** Bed inspector layer (sheets / comforter / pillow). */
  placeBeddingKind: BeddingPlacementKind | null;
  /** Optional brand shown above the product title. */
  brand: string | null;
  /** Short highlight bullets for the product drawer. */
  featureBullets: string[];
  /** Human-readable size / pack details. */
  dimensionsText: string | null;
  /** Optional 0–5 rating when known. */
  rating: number | null;
  /** Optional review count paired with rating. */
  reviewCount: number | null;
  /** Optional availability note (e.g. In stock). */
  availability: string | null;
}

export interface ChecklistCategoryWithProducts extends ChecklistCategory {
  products: CuratedProduct[];
}

export interface ShoppingListEntry {
  productId: string;
  quantity: number;
  reviewDone: boolean;
}

export const PRODUCT_IMAGES_BUCKET = 'product-images';
export const CHECKLIST_CHECKED_KEY = 'toova-checklist-checked';
export const CHECKLIST_RESOLUTION_KEY = 'toova-checklist-resolution';
export const MOVE_IN_BUDGET_KEY = 'toova-move-in-budget';
export const SHOPPING_LIST_KEY = 'toova-shopping-list';
export const CHECKLIST_PROGRESS_MERGED_KEY = 'toova-checklist-progress-merged';

/** User marked a suggested leaf as already owned or not needed. */
export type CategoryResolution = 'have' | 'skip';

export type ChecklistLineStatus = 'placed' | 'have' | 'skip' | 'open';

/** @deprecated Prefer ChecklistCategoryWithProducts from the shopping catalog. */
export interface ChecklistLink {
  label: string;
  url: string;
}

/** @deprecated Prefer ChecklistCategoryWithProducts from the shopping catalog. */
export interface ChecklistItem {
  id: string;
  name: string;
  links: ChecklistLink[];
}

export function productImagePublicUrl(imagePath: string | null | undefined): string | null {
  const path = imagePath?.trim();
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // Local public/ assets — respect Vite BASE_URL (GitHub Pages / nested deploys).
  const viteBase = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  if (path.startsWith('/')) return `${viteBase}${path.replace(/^\//, '')}`;
  if (path.startsWith('checklist-refs/')) return `${viteBase}${path}`;
  const base = 'https://xfifgtedssabneqlxbhf.supabase.co/storage/v1/object/public';
  return `${base}/${PRODUCT_IMAGES_BUCKET}/${path}`;
}

export function formatPriceCents(
  cents: number | null | undefined,
  currency = 'USD',
): string | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function loadCheckedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(CHECKLIST_CHECKED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export function saveCheckedIds(ids: Set<string>) {
  try {
    localStorage.setItem(CHECKLIST_CHECKED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadLocalResolutions(): Map<string, CategoryResolution> {
  try {
    const raw = localStorage.getItem(CHECKLIST_RESOLUTION_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    const map = new Map<string, CategoryResolution>();
    for (const [key, value] of Object.entries(parsed)) {
      if (value === 'have' || value === 'skip') map.set(key, value);
    }
    return map;
  } catch {
    return new Map();
  }
}

export function saveLocalResolutions(resolutions: Map<string, CategoryResolution>) {
  try {
    const obj: Record<string, CategoryResolution> = {};
    for (const [key, value] of resolutions) obj[key] = value;
    localStorage.setItem(CHECKLIST_RESOLUTION_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

export function loadLocalMoveInBudgetCents(): number | null {
  try {
    const raw = localStorage.getItem(MOVE_IN_BUDGET_KEY);
    if (raw == null || raw === '') return null;
    const cents = Number(raw);
    if (!Number.isFinite(cents) || cents < 0) return null;
    return Math.round(cents);
  } catch {
    return null;
  }
}

export function saveLocalMoveInBudgetCents(cents: number | null) {
  try {
    if (cents == null) localStorage.removeItem(MOVE_IN_BUDGET_KEY);
    else localStorage.setItem(MOVE_IN_BUDGET_KEY, String(Math.max(0, Math.round(cents))));
  } catch {
    /* ignore */
  }
}

export function checklistLineStatus(
  placed: boolean,
  resolution: CategoryResolution | undefined,
): ChecklistLineStatus {
  if (placed) return 'placed';
  if (resolution === 'have') return 'have';
  if (resolution === 'skip') return 'skip';
  return 'open';
}

export function isChecklistToPlace(status: ChecklistLineStatus): boolean {
  return status === 'open';
}

export function isChecklistResolved(status: ChecklistLineStatus): boolean {
  return status !== 'open';
}

export function lowestPriceCentsForProducts(
  products: Pick<CuratedProduct, 'priceCents'>[],
): number | null {
  let min: number | null = null;
  for (const p of products) {
    if (p.priceCents == null) continue;
    if (min == null || p.priceCents < min) min = p.priceCents;
  }
  return min;
}

/** Price attributed to a single room item for budget spent. */
export function priceCentsForRoomItem(
  item: ChecklistPlacementItem,
  categories: ChecklistCategoryWithProducts[],
  productsById: Record<string, CuratedProduct>,
): number | null {
  const curatedId = item.curatedProductId?.trim();
  if (curatedId) {
    const product = productsById[curatedId];
    return product?.priceCents ?? null;
  }
  const ref: ChecklistPlacementRef = {
    kind: item.kind,
    curatedProductId: item.curatedProductId,
    hangingKind: item.kind === 'hanging' ? item.hanging?.kind : undefined,
  };
  const satisfied = categoryIdsSatisfiedByPlacements(categories, [ref]);
  if (satisfied.size === 0) return null;
  for (const catId of satisfied) {
    const cat = categories.find((c) => c.id === catId);
    if (!cat) continue;
    const cheapest = lowestPriceCentsForProducts(cat.products);
    if (cheapest != null) return cheapest;
  }
  return null;
}

/** Sum of prices for items currently in the room (skips items with no known price). */
export function spentCentsForRoom(
  categories: ChecklistCategoryWithProducts[],
  items: Record<string, ChecklistPlacementItem | undefined>,
  order: string[],
  productsById: Record<string, CuratedProduct>,
): number {
  let sum = 0;
  for (const id of order) {
    const item = items[id];
    if (!item) continue;
    const price = priceCentsForRoomItem(item, categories, productsById);
    if (price != null) sum += price;
  }
  return sum;
}

export function remainingCents(budgetCents: number, spentCents: number): number {
  return budgetCents - spentCents;
}

export function formatBudgetRemaining(
  remainingCentsValue: number,
  currency = 'USD',
): string {
  if (remainingCentsValue < 0) {
    const over = formatPriceCents(-remainingCentsValue, currency);
    return over ? `${over} over` : 'Over budget';
  }
  return formatPriceCents(remainingCentsValue, currency) ?? '$0';
}

export interface ChecklistBudgetSummary {
  budgetCents: number | null;
  spentCents: number;
  remainingCents: number | null;
  remainingLabel: string;
  spentLabel: string;
  spentOfCapLabel: string | null;
}

export function computeChecklistBudgetSummary(
  budgetCents: number | null,
  spentCentsValue: number,
  currency = 'USD',
): ChecklistBudgetSummary {
  const spentLabel = formatPriceCents(spentCentsValue, currency) ?? '$0';
  const remaining =
    budgetCents != null ? remainingCents(budgetCents, spentCentsValue) : null;
  const remainingLabel =
    remaining != null ? formatBudgetRemaining(remaining, currency) : '';
  const spentOfCapLabel =
    budgetCents != null
      ? `Spent ${spentLabel} of ${formatPriceCents(budgetCents, currency) ?? '$0'}`
      : null;
  return {
    budgetCents,
    spentCents: spentCentsValue,
    remainingCents: remaining,
    remainingLabel,
    spentLabel,
    spentOfCapLabel,
  };
}

export function loadLocalShoppingList(): ShoppingListEntry[] {
  try {
    const raw = localStorage.getItem(SHOPPING_LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): ShoppingListEntry | null => {
        if (!row || typeof row !== 'object') return null;
        const o = row as Record<string, unknown>;
        if (typeof o.productId !== 'string') return null;
        const quantity = typeof o.quantity === 'number' && o.quantity > 0 ? o.quantity : 1;
        return {
          productId: o.productId,
          quantity,
          reviewDone: o.reviewDone === true,
        };
      })
      .filter((x): x is ShoppingListEntry => x != null);
  } catch {
    return [];
  }
}

export function saveLocalShoppingList(entries: ShoppingListEntry[]) {
  try {
    localStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

/** Map legacy slug-based checked ids onto category UUIDs when possible. */
export function remapCheckedSlugsToIds(
  checked: Set<string>,
  categories: ChecklistCategory[],
): Set<string> {
  const bySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const byId = new Set(categories.map((c) => c.id));
  const next = new Set<string>();
  for (const key of checked) {
    if (byId.has(key)) next.add(key);
    else {
      const id = bySlug.get(key);
      if (id) next.add(id);
    }
  }
  return next;
}

/** Minimal room-item shape used to match checklist categories. */
export interface ChecklistPlacementRef {
  kind: string;
  curatedProductId?: string | null;
  /** Set when kind === 'hanging'. */
  hangingKind?: HangingDecorKind | null;
  /** Set when kind === 'bedding'. */
  beddingKind?: BeddingPlacementKind | null;
}

/** Minimal room item shape for building placement refs. */
export interface ChecklistPlacementItem {
  kind: string;
  curatedProductId?: string | null;
  hanging?: { kind: HangingDecorKind } | null;
  beddingConfig?: BeddingConfig;
  beddingEnabled?: boolean;
  blanketColor?: string;
}

function beddingPlacementRefsForBed(item: ChecklistPlacementItem): ChecklistPlacementRef[] {
  const config = resolveBeddingConfig(item);
  const refs: ChecklistPlacementRef[] = [];
  if (config.sheets.enabled) refs.push({ kind: 'bedding', beddingKind: 'sheets' });
  if (config.comforter.enabled) refs.push({ kind: 'bedding', beddingKind: 'comforter' });
  if (config.pillows.enabled && config.pillows.items.length > 0) {
    refs.push({ kind: 'bedding', beddingKind: 'pillow' });
  }
  return refs;
}

/** Map room store items to checklist placement refs. */
export function roomItemsToPlacementRefs(
  items: Record<string, ChecklistPlacementItem | undefined>,
  order: string[],
): ChecklistPlacementRef[] {
  const refs: ChecklistPlacementRef[] = [];
  for (const id of order) {
    const item = items[id];
    if (!item) continue;
    refs.push({
      kind: item.kind,
      curatedProductId: item.curatedProductId,
      hangingKind: item.kind === 'hanging' ? item.hanging?.kind : undefined,
    });
    if (item.kind === 'bed') refs.push(...beddingPlacementRefsForBed(item));
  }
  return refs;
}

/** Known checklist products mapped to hanging draw features (fallback when DB column unset). */
const PRODUCT_SLUG_HANGING_KIND: Record<string, HangingDecorKind> = {
  fairlylights1: 'lights',
  led1: 'led-strip',
  leaves: 'leaves',
};

/** Known checklist products mapped to bed bedding layers (fallback when DB column unset). */
const PRODUCT_SLUG_BEDDING_KIND: Record<string, BeddingPlacementKind> = {
  'bed-sheets': 'sheets',
  'bed-comforter': 'comforter',
  pillows: 'pillow',
};

/** Checklist category slugs for bed bedding layers. */
const CATEGORY_SLUG_BEDDING_KIND: Record<string, BeddingPlacementKind> = {
  'bed-sheets': 'sheets',
  'bed-comforter': 'comforter',
  pillows: 'pillow',
};

/** Resolve hanging draw kind from product DB field or known slug. */
export function resolvePlaceHangingKind(
  product: Pick<CuratedProduct, 'slug' | 'placeHangingKind'>,
): HangingDecorKind | null {
  if (product.placeHangingKind) return product.placeHangingKind;
  return PRODUCT_SLUG_HANGING_KIND[product.slug] ?? null;
}

/** Draw feature kind for checklist products mapped to hanging decor. */
export function getProductDrawKind(
  product: Pick<CuratedProduct, 'slug' | 'placeHangingKind'>,
): HangingDecorKind | null {
  return resolvePlaceHangingKind(product);
}

/** Resolve bed bedding layer from product DB field or known slug. */
export function resolvePlaceBeddingKind(
  product: Pick<CuratedProduct, 'slug' | 'placeBeddingKind'>,
): BeddingPlacementKind | null {
  if (product.placeBeddingKind) return product.placeBeddingKind;
  return PRODUCT_SLUG_BEDDING_KIND[product.slug] ?? null;
}

/**
 * Category IDs covered by room placements: curated product category,
 * matching place_builtin / place_catalog / place_hanging kind, or category slug === item kind.
 */
export function categoryIdsSatisfiedByPlacements(
  categories: ChecklistCategoryWithProducts[],
  placements: ChecklistPlacementRef[],
): Set<string> {
  const productsById = new Map<string, CuratedProduct>();
  const byBuiltinKind = new Map<string, string>();
  const byCatalogKind = new Map<string, string>();
  const byHangingKind = new Map<HangingDecorKind, Set<string>>();
  const byBeddingKind = new Map<BeddingPlacementKind, Set<string>>();
  const bySlug = new Map<string, string>();

  for (const cat of categories) {
    bySlug.set(cat.slug, cat.id);
    const categoryBeddingKind = CATEGORY_SLUG_BEDDING_KIND[cat.slug];
    if (categoryBeddingKind) {
      let ids = byBeddingKind.get(categoryBeddingKind);
      if (!ids) {
        ids = new Set<string>();
        byBeddingKind.set(categoryBeddingKind, ids);
      }
      ids.add(cat.id);
    }
    for (const product of cat.products) {
      productsById.set(product.id, product);
      if (product.placeBuiltinKind) {
        byBuiltinKind.set(product.placeBuiltinKind, cat.id);
      }
      if (product.placeCatalogKind) {
        byCatalogKind.set(product.placeCatalogKind, cat.id);
      }
      const hangingKind = resolvePlaceHangingKind(product);
      if (hangingKind) {
        let ids = byHangingKind.get(hangingKind);
        if (!ids) {
          ids = new Set<string>();
          byHangingKind.set(hangingKind, ids);
        }
        ids.add(cat.id);
      }
      const beddingKind = resolvePlaceBeddingKind(product);
      if (beddingKind) {
        let ids = byBeddingKind.get(beddingKind);
        if (!ids) {
          ids = new Set<string>();
          byBeddingKind.set(beddingKind, ids);
        }
        ids.add(cat.id);
      }
    }
  }

  const satisfied = new Set<string>();
  for (const item of placements) {
    const curatedId = item.curatedProductId?.trim();
    if (curatedId) {
      const product = productsById.get(curatedId);
      if (product) satisfied.add(product.categoryId);
    }
    const byBuiltin = byBuiltinKind.get(item.kind);
    if (byBuiltin) satisfied.add(byBuiltin);
    const byCatalog = byCatalogKind.get(item.kind);
    if (byCatalog) satisfied.add(byCatalog);
    const byKindSlug = bySlug.get(item.kind);
    if (byKindSlug) satisfied.add(byKindSlug);
    if (item.kind === 'hanging' && item.hangingKind) {
      const catIds = byHangingKind.get(item.hangingKind);
      if (catIds) {
        for (const catId of catIds) satisfied.add(catId);
      }
    }
    if (item.beddingKind) {
      const catIds = byBeddingKind.get(item.beddingKind);
      if (catIds) {
        for (const catId of catIds) satisfied.add(catId);
      }
    }
  }
  return satisfied;
}

/** Categories covered by current To Buy: room placements and/or shopping-list products. */
export function categoryIdsSatisfiedByPurchases(
  categories: ChecklistCategoryWithProducts[],
  placements: ChecklistPlacementRef[],
  listProductIds: Iterable<string>,
): Set<string> {
  const satisfied = categoryIdsSatisfiedByPlacements(categories, placements);
  const productsById = new Map<string, CuratedProduct>();
  for (const cat of categories) {
    for (const product of cat.products) productsById.set(product.id, product);
  }
  for (const productId of listProductIds) {
    const product = productsById.get(productId);
    if (product) satisfied.add(product.categoryId);
  }
  return satisfied;
}

/** True when a category can appear in To Buy via curated products. */
export function categoryHasPurchasableProducts(
  category: ChecklistCategoryWithProducts,
): boolean {
  return category.products.length > 0;
}

/** Top-level gallery groups (no parent). */
export function topLevelCategories<T extends ChecklistCategory>(categories: T[]): T[] {
  return categories.filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Leaf / child categories under a parent group. */
export function childCategories<T extends ChecklistCategory>(
  categories: T[],
  parentId: string,
): T[] {
  return categories
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Leaf categories only (used for packed progress). */
export function leafCategories<T extends ChecklistCategory>(categories: T[]): T[] {
  const parentsWithChildren = new Set(
    categories.filter((c) => c.parentId).map((c) => c.parentId as string),
  );
  return categories.filter((c) => !parentsWithChildren.has(c.id));
}

/** Cover image for a group: category image, else first child product image, else first own product image. */
export function categoryCoverImageUrl(
  category: ChecklistCategoryWithProducts,
  all: ChecklistCategoryWithProducts[],
): string | null {
  if (category.imageUrl) return category.imageUrl;
  const own = category.products.find((p) => p.imageUrl)?.imageUrl;
  if (own) return own;
  for (const child of childCategories(all, category.id)) {
    if (child.imageUrl) return child.imageUrl;
    const url = child.products.find((p) => p.imageUrl)?.imageUrl;
    if (url) return url;
  }
  return null;
}

export function categoryProductCount(
  category: ChecklistCategoryWithProducts,
  all: ChecklistCategoryWithProducts[],
): number {
  if (category.products.length > 0) return category.products.length;
  return childCategories(all, category.id).reduce((n, c) => n + c.products.length, 0);
}
