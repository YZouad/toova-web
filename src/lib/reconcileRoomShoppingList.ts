import type {
  ChecklistCategoryWithProducts,
  ChecklistPlacementItem,
  CuratedProduct,
  ShoppingListEntry,
} from './dormChecklist';
import { effectiveShoppingQuantity, normalizeShoppingListEntry } from './shoppingListEntry';
import { productForRoomItem } from './purchaseCart';

export function countProductsInRoom(input: {
  categories: ChecklistCategoryWithProducts[];
  items: Record<string, ChecklistPlacementItem | undefined>;
  order: string[];
  productsById: Record<string, CuratedProduct>;
}): Map<string, number> {
  const { categories, items, order, productsById } = input;
  const counts = new Map<string, number>();
  for (const itemId of order) {
    const item = items[itemId];
    if (!item) continue;
    const resolved = productForRoomItem(item, categories, productsById);
    if (!resolved) continue;
    const id = resolved.product.id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Merge room placement counts with existing manual quantities. */
export function reconcileRoomShoppingList(input: {
  roomCounts: Map<string, number>;
  current: ShoppingListEntry[];
}): ShoppingListEntry[] {
  const { roomCounts, current } = input;
  const byProduct = new Map<string, ShoppingListEntry>();
  for (const row of current) {
    byProduct.set(row.productId, { ...row });
  }

  const allProductIds = new Set<string>([...byProduct.keys(), ...roomCounts.keys()]);

  const next: ShoppingListEntry[] = [];
  for (const productId of [...allProductIds].sort()) {
    const roomQty = roomCounts.get(productId) ?? 0;
    const prev = byProduct.get(productId);
    const manualQty = prev?.manualQuantity ?? 0;
    const reviewDone = prev?.reviewDone ?? false;
    if (roomQty === 0 && manualQty === 0) continue;
    next.push(
      normalizeShoppingListEntry({
        productId,
        roomQuantity: roomQty,
        manualQuantity: manualQty,
        reviewDone,
      }),
    );
  }
  return next;
}

export function diffShoppingLists(
  before: ShoppingListEntry[],
  after: ShoppingListEntry[],
): { added: string[]; removed: string[]; changed: string[] } {
  const beforeMap = new Map(before.map((e) => [e.productId, effectiveShoppingQuantity(e)]));
  const afterMap = new Map(after.map((e) => [e.productId, effectiveShoppingQuantity(e)]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [id, qty] of afterMap) {
    if (!beforeMap.has(id)) added.push(id);
    else if (beforeMap.get(id) !== qty) changed.push(id);
  }
  for (const id of beforeMap.keys()) {
    if (!afterMap.has(id)) removed.push(id);
  }
  return { added, removed, changed };
}