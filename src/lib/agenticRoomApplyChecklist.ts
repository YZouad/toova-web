import {
  saveLocalMoveInBudgetCents,
  saveLocalShoppingList,
  type ShoppingListEntry,
} from './dormChecklist';
import { isGuestWorkspaceId } from './guestDesignSnapshot';
import {
  type AgenticShoppingManifestEntry,
  saveLocalAgenticShoppingManifest,
} from './agenticShoppingManifest';
import {
  upsertAgenticShoppingManifestEntries,
  upsertShoppingListEntry,
  upsertUserMoveInBudgetCents,
} from './shoppingCatalog';

/** Write agentic shopping list entries directly for a room (avoids provider race on room switch). */
export async function applyAgenticShoppingList(
  roomId: string,
  entries: ShoppingListEntry[],
  userId: string | null | undefined,
  budgetCents?: number | null,
): Promise<void> {
  if (!roomId.trim()) return;

  const isGuest = isGuestWorkspaceId(roomId) || !userId;

  if (budgetCents != null && budgetCents > 0) {
    if (isGuest) {
      saveLocalMoveInBudgetCents(budgetCents, roomId);
    } else {
      await upsertUserMoveInBudgetCents(userId, roomId, budgetCents);
    }
  }

  if (entries.length === 0) return;

  if (isGuest) {
    saveLocalShoppingList(entries, roomId);
    return;
  }

  await Promise.all(
    entries.map((entry) => upsertShoppingListEntry(userId, roomId, entry)),
  );
}

/** Persist full agentic room-plan lines (including query-only search links). */
export async function applyAgenticShoppingManifest(
  roomId: string,
  entries: AgenticShoppingManifestEntry[],
  userId: string | null | undefined,
): Promise<void> {
  if (!roomId.trim() || entries.length === 0) return;

  const isGuest = isGuestWorkspaceId(roomId) || !userId;
  if (isGuest) {
    saveLocalAgenticShoppingManifest(roomId, entries);
    return;
  }

  await upsertAgenticShoppingManifestEntries(userId, roomId, entries);
}

export function shoppingEntriesFromResolved(
  items: Array<{ product: { id: string } | null; qty: number }>,
): ShoppingListEntry[] {
  const merged = new Map<string, number>();
  for (const item of items) {
    if (!item.product) continue;
    merged.set(item.product.id, (merged.get(item.product.id) ?? 0) + item.qty);
  }
  return [...merged.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
    reviewDone: false,
  }));
}
