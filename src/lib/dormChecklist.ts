/** Shopping checklist / curated product types and localStorage helpers. */

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
export const SHOPPING_LIST_KEY = 'toova-shopping-list';
export const CHECKLIST_PROGRESS_MERGED_KEY = 'toova-checklist-progress-merged';

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
}

/**
 * Category IDs covered by room placements: curated product category,
 * matching place_builtin / place_catalog kind, or category slug === item kind.
 */
export function categoryIdsSatisfiedByPlacements(
  categories: ChecklistCategoryWithProducts[],
  placements: ChecklistPlacementRef[],
): Set<string> {
  const productsById = new Map<string, CuratedProduct>();
  const byBuiltinKind = new Map<string, string>();
  const byCatalogKind = new Map<string, string>();
  const bySlug = new Map<string, string>();

  for (const cat of categories) {
    bySlug.set(cat.slug, cat.id);
    for (const product of cat.products) {
      productsById.set(product.id, product);
      if (product.placeBuiltinKind) {
        byBuiltinKind.set(product.placeBuiltinKind, cat.id);
      }
      if (product.placeCatalogKind) {
        byCatalogKind.set(product.placeCatalogKind, cat.id);
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
