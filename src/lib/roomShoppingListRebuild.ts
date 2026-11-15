import { countProductsInRoom, reconcileRoomShoppingList } from './reconcileRoomShoppingList';
import { loadRoomLayout } from '../hooks/useRoomLayout';
import { fetchPublishedShoppingCatalog, fetchUserShoppingList, syncShoppingListEntries } from './shoppingCatalog';
import { mergeLocalProductsIntoCategories } from './localRoomChecklist';
import { loadLocalChecklistProducts } from './localRoomChecklist';
import {
  loadLocalShoppingList,
  saveLocalShoppingList,
  SHOPPING_LIST_UPDATED_EVENT,
  type ChecklistCategoryWithProducts,
  type CuratedProduct,
  type ShoppingListEntry,
} from './dormChecklist';
import { isRoomLocalProductId } from './ownedChecklistItems';

function productsByIdFromCategories(categories: ChecklistCategoryWithProducts[]): Record<string, CuratedProduct> {
  const map: Record<string, CuratedProduct> = {};
  for (const cat of categories) {
    for (const p of cat.products) map[p.id] = p;
  }
  return map;
}

function mergeLocalOnlyProducts(
  synced: ShoppingListEntry[],
  roomId: string,
): ShoppingListEntry[] {
  const localOnly = loadLocalShoppingList(roomId).filter((e) => isRoomLocalProductId(e.productId));
  const ids = new Set(synced.map((e) => e.productId));
  return [...synced, ...localOnly.filter((e) => !ids.has(e.productId))];
}

/** Room placements (saved layout) merged with existing manual rows; optional Supabase sync. */
export async function rebuildRoomShoppingListFromLayout(
  userId: string | null | undefined,
  roomId: string,
): Promise<ShoppingListEntry[]> {
  const layout = await loadRoomLayout(roomId);
  const published = await fetchPublishedShoppingCatalog();
  const localProducts = loadLocalChecklistProducts(roomId);
  const categories = mergeLocalProductsIntoCategories(published, localProducts);
  const productsById = productsByIdFromCategories(categories);
  const itemsById = Object.fromEntries(layout.items.map((it) => [it.id, it]));
  const roomCounts = countProductsInRoom({
    categories,
    items: itemsById,
    order: layout.order,
    productsById,
  });
  const previous = userId?.trim()
    ? await fetchUserShoppingList(userId, roomId)
    : loadLocalShoppingList(roomId).filter((e) => !isRoomLocalProductId(e.productId));
  const next = reconcileRoomShoppingList({ roomCounts, current: previous });
  if (userId?.trim()) {
    await syncShoppingListEntries(userId, roomId, next, previous);
  }
  const merged = mergeLocalOnlyProducts(next, roomId);
  saveLocalShoppingList(merged, roomId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHOPPING_LIST_UPDATED_EVENT, { detail: { roomId } }));
  }
  return merged;
}

/** Sync room_quantity from saved room_items; keeps manual_quantity rows intact. */
export async function refreshRoomChecklistFromSavedLayout(
  userId: string | null | undefined,
  roomId: string,
): Promise<ShoppingListEntry[]> {
  return rebuildRoomShoppingListFromLayout(userId, roomId);
}

export async function rebuildAllUserRoomShoppingLists(
  userId: string,
  roomIds: string[],
): Promise<void> {
  for (const roomId of roomIds) {
    try {
      await rebuildRoomShoppingListFromLayout(userId, roomId);
    } catch (e) {
      console.warn('[toova] room shopping list rebuild failed', roomId, e);
    }
  }
}