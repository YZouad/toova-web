import type {
  CategoryResolution,
  ChecklistCategoryWithProducts,
  ChecklistPlacementItem,
  CuratedProduct,
  ShoppingListEntry,
} from './dormChecklist';
import { getProductDrawKind } from './dormChecklist';

export type PurchaseCartSource = 'list' | 'room' | 'both';

export interface PurchaseCartLine {
  productId: string;
  product: CuratedProduct;
  quantity: number;
  source: PurchaseCartSource;
  reviewDone: boolean;
  /** True when room match used kind fallback, not curatedProductId. */
  approximate: boolean;
}

function matchesRoomItemToProduct(
  item: ChecklistPlacementItem,
  product: CuratedProduct,
): boolean {
  if (item.curatedProductId === product.id) return true;
  if (item.curatedProductId) return false;
  const drawKind = getProductDrawKind(product);
  if (drawKind && item.kind === 'hanging' && item.hanging?.kind === drawKind) return true;
  if (product.placeBuiltinKind && item.kind === product.placeBuiltinKind) return true;
  if (product.placeCatalogKind && item.kind === product.placeCatalogKind) return true;
  return false;
}

export function productForRoomItem(
  item: ChecklistPlacementItem,
  categories: ChecklistCategoryWithProducts[],
  productsById: Record<string, CuratedProduct>,
): { product: CuratedProduct; approximate: boolean } | null {
  const curatedId = item.curatedProductId?.trim();
  if (curatedId) {
    const product = productsById[curatedId];
    return product ? { product, approximate: false } : null;
  }
  for (const cat of categories) {
    for (const product of cat.products) {
      if (!product.published) continue;
      if (matchesRoomItemToProduct(item, product)) {
        return { product, approximate: true };
      }
    }
  }
  return null;
}

function isCategoryExcludedFromPurchase(
  categoryId: string,
  getResolution: (categoryId: string) => CategoryResolution | undefined,
): boolean {
  const resolution = getResolution(categoryId);
  return resolution === 'have' || resolution === 'skip';
}

/** Items to purchase: shopping list entries plus placed room picks (deduped by product). */
export function buildPurchaseCartLines(input: {
  categories: ChecklistCategoryWithProducts[];
  items: Record<string, ChecklistPlacementItem | undefined>;
  order: string[];
  list: ShoppingListEntry[];
  productsById: Record<string, CuratedProduct>;
  getResolution: (categoryId: string) => CategoryResolution | undefined;
}): PurchaseCartLine[] {
  const { categories, items, order, list, productsById, getResolution } = input;
  const byProductId = new Map<string, PurchaseCartLine>();

  for (const entry of list) {
    const product = productsById[entry.productId];
    if (!product) continue;
    if (isCategoryExcludedFromPurchase(product.categoryId, getResolution)) continue;
    byProductId.set(product.id, {
      productId: product.id,
      product,
      quantity: entry.quantity,
      source: 'list',
      reviewDone: entry.reviewDone,
      approximate: false,
    });
  }

  for (const itemId of order) {
    const item = items[itemId];
    if (!item) continue;
    const resolved = productForRoomItem(item, categories, productsById);
    if (!resolved) continue;
    const { product, approximate } = resolved;
    if (isCategoryExcludedFromPurchase(product.categoryId, getResolution)) continue;

    const existing = byProductId.get(product.id);
    if (existing) {
      existing.source = 'both';
      existing.quantity = Math.max(existing.quantity, 1);
      existing.approximate = existing.approximate && approximate;
    } else {
      byProductId.set(product.id, {
        productId: product.id,
        product,
        quantity: 1,
        source: 'room',
        reviewDone: false,
        approximate,
      });
    }
  }

  return [...byProductId.values()].sort(
    (a, b) =>
      a.product.categoryId.localeCompare(b.product.categoryId) ||
      a.product.sortOrder - b.product.sortOrder ||
      a.product.name.localeCompare(b.product.name),
  );
}

export function purchaseCartTotalCents(lines: PurchaseCartLine[]): {
  sum: number;
  known: boolean;
} {
  let sum = 0;
  let known = true;
  for (const line of lines) {
    if (line.product.priceCents == null) {
      known = false;
      continue;
    }
    sum += line.product.priceCents * line.quantity;
  }
  return { sum, known };
}
