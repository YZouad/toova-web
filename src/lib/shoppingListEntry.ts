import type { ShoppingListEntry } from './dormChecklist';

export function effectiveShoppingQuantity(
  entry: Pick<ShoppingListEntry, 'quantity' | 'roomQuantity' | 'manualQuantity'>,
): number {
  const room = entry.roomQuantity ?? 0;
  const manual = entry.manualQuantity ?? 0;
  if (room > 0 || manual > 0) return Math.max(room, manual);
  return Math.max(1, entry.quantity);
}

export function normalizeShoppingListEntry(input: {
  productId: string;
  roomQuantity?: number;
  manualQuantity?: number;
  quantity?: number;
  reviewDone?: boolean;
}): ShoppingListEntry {
  const roomQuantity = Math.max(0, Math.floor(input.roomQuantity ?? 0));
  const manualQuantity = Math.max(0, Math.floor(input.manualQuantity ?? 0));
  let quantity = input.quantity;
  if (quantity == null || !Number.isFinite(quantity)) {
    quantity = Math.max(roomQuantity, manualQuantity);
  }
  quantity = Math.max(1, Math.floor(quantity));
  if (roomQuantity > 0 || manualQuantity > 0) {
    quantity = Math.max(roomQuantity, manualQuantity);
  }
  return {
    productId: input.productId,
    quantity,
    roomQuantity,
    manualQuantity,
    reviewDone: input.reviewDone === true,
  };
}

/** Parse legacy rows (quantity only) as manual-only. */
/** Test / fixture helper for manual-only rows. */
export function manualShoppingEntry(
  productId: string,
  quantity = 1,
  reviewDone = false,
): ShoppingListEntry {
  return normalizeShoppingListEntry({
    productId,
    manualQuantity: quantity,
    roomQuantity: 0,
    reviewDone,
  });
}

export function parseShoppingListRow(row: unknown): ShoppingListEntry | null {
  if (!row || typeof row !== 'object') return null;
  const o = row as Record<string, unknown>;
  if (typeof o.productId !== 'string') return null;
  const reviewDone = o.reviewDone === true;
  const hasRoom = typeof o.roomQuantity === 'number';
  const hasManual = typeof o.manualQuantity === 'number';
  if (hasRoom || hasManual) {
    return normalizeShoppingListEntry({
      productId: o.productId,
      roomQuantity: hasRoom ? Number(o.roomQuantity) : 0,
      manualQuantity: hasManual ? Number(o.manualQuantity) : 0,
      quantity: typeof o.quantity === 'number' ? Number(o.quantity) : undefined,
      reviewDone,
    });
  }
  const quantity = typeof o.quantity === 'number' && o.quantity > 0 ? Math.floor(o.quantity) : 1;
  return normalizeShoppingListEntry({
    productId: o.productId,
    manualQuantity: quantity,
    roomQuantity: 0,
    reviewDone,
  });
}