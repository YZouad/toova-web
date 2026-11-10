import {
  loadLocalShoppingList,
  saveLocalShoppingList,
  type ShoppingListEntry,
} from './dormChecklist';
import { upsertShoppingListEntry, removeShoppingListEntry } from './shoppingCatalog';
import type { RoomTag } from './roomTags';

export const USER_CHECKLIST_LISTS_KEY = 'toova-user-checklist-lists';
export const CUSTOM_CHECKLIST_ITEMS_KEY = 'toova-custom-checklist-items';

export type ChecklistListKind = 'room' | 'custom';

export interface UserChecklistListMeta {
  id: string;
  name: string;
  kind: ChecklistListKind;
  roomId?: string;
  areaTag?: RoomTag | null;
  createdAt: string;
  updatedAt: string;
}

function listsStorageKey(userId: string): string {
  return `${USER_CHECKLIST_LISTS_KEY}:${userId}`;
}

function customItemsKey(listId: string): string {
  return `${CUSTOM_CHECKLIST_ITEMS_KEY}:${listId}`;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `list-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadCustomChecklistLists(userId: string): UserChecklistListMeta[] {
  try {
    const raw = localStorage.getItem(listsStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): UserChecklistListMeta | null => {
        if (!row || typeof row !== 'object') return null;
        const o = row as Record<string, unknown>;
        if (typeof o.id !== 'string' || typeof o.name !== 'string') return null;
        const kind = o.kind === 'room' || o.kind === 'custom' ? o.kind : 'custom';
        return {
          id: o.id,
          name: o.name.trim(),
          kind,
          roomId: typeof o.roomId === 'string' ? o.roomId : undefined,
          areaTag:
            typeof o.areaTag === 'string' ? (o.areaTag as RoomTag) : o.areaTag === null ? null : undefined,
          createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
          updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
        };
      })
      .filter((x): x is UserChecklistListMeta => x != null);
  } catch {
    return [];
  }
}

function saveCustomChecklistLists(userId: string, lists: UserChecklistListMeta[]): void {
  try {
    localStorage.setItem(listsStorageKey(userId), JSON.stringify(lists));
  } catch {
    /* ignore */
  }
}

export function roomChecklistListMeta(room: { id: string; name: string }): UserChecklistListMeta {
  const now = new Date().toISOString();
  return {
    id: room.id,
    name: room.name.trim() || 'Untitled room',
    kind: 'room',
    roomId: room.id,
    createdAt: now,
    updatedAt: now,
  };
}

/** Room checklists (from saved rooms) plus persisted custom lists. */
export function mergeChecklistLists(
  userId: string,
  rooms: Array<{ id: string; name: string }>,
): UserChecklistListMeta[] {
  const custom = loadCustomChecklistLists(userId).filter((l) => l.kind === 'custom');
  const roomLists = rooms.map(roomChecklistListMeta);
  const customOnly = custom.filter((c) => !c.roomId);
  return [...roomLists, ...customOnly].sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'room' ? -1 : 1,
  );
}

export function createCustomChecklistList(userId: string, name: string): UserChecklistListMeta {
  const trimmed = name.trim() || 'My checklist';
  const now = new Date().toISOString();
  const list: UserChecklistListMeta = {
    id: `custom:${newId()}`,
    name: trimmed,
    kind: 'custom',
    createdAt: now,
    updatedAt: now,
  };
  const lists = loadCustomChecklistLists(userId);
  lists.push(list);
  saveCustomChecklistLists(userId, lists);
  return list;
}

export function renameChecklistList(userId: string, listId: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const lists = loadCustomChecklistLists(userId);
  const idx = lists.findIndex((l) => l.id === listId && l.kind === 'custom');
  if (idx < 0) return false;
  lists[idx] = { ...lists[idx], name: trimmed, updatedAt: new Date().toISOString() };
  saveCustomChecklistLists(userId, lists);
  return true;
}

export function deleteCustomChecklistList(userId: string, listId: string): void {
  const lists = loadCustomChecklistLists(userId).filter((l) => l.id !== listId);
  saveCustomChecklistLists(userId, lists);
  try {
    localStorage.removeItem(customItemsKey(listId));
  } catch {
    /* ignore */
  }
}

export function loadCustomChecklistItems(listId: string): ShoppingListEntry[] {
  try {
    const raw = localStorage.getItem(customItemsKey(listId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): ShoppingListEntry | null => {
        if (!row || typeof row !== 'object') return null;
        const o = row as Record<string, unknown>;
        if (typeof o.productId !== 'string') return null;
        const quantity = typeof o.quantity === 'number' && o.quantity > 0 ? Math.floor(o.quantity) : 1;
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

function saveCustomChecklistItems(listId: string, entries: ShoppingListEntry[]): void {
  try {
    localStorage.setItem(customItemsKey(listId), JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

export function loadChecklistListItems(list: UserChecklistListMeta): ShoppingListEntry[] {
  if (list.kind === 'room' && list.roomId) return loadLocalShoppingList(list.roomId);
  return loadCustomChecklistItems(list.id);
}

function mergeEntry(entries: ShoppingListEntry[], productId: string, quantity: number): ShoppingListEntry[] {
  const next = [...entries];
  const idx = next.findIndex((e) => e.productId === productId);
  if (idx >= 0) {
    next[idx] = {
      ...next[idx],
      quantity: next[idx].quantity + quantity,
    };
    return next;
  }
  return [...next, { productId, quantity, reviewDone: false }];
}

export async function addProductToChecklistList(
  userId: string,
  list: UserChecklistListMeta,
  productId: string,
  quantity = 1,
): Promise<void> {
  if (list.kind === 'room' && list.roomId) {
    const entries = mergeEntry(loadLocalShoppingList(list.roomId), productId, quantity);
    saveLocalShoppingList(entries, list.roomId);
    const row = entries.find((e) => e.productId === productId);
    if (row) {
      await upsertShoppingListEntry(userId, list.roomId, row);
    }
    return;
  }
  const entries = mergeEntry(loadCustomChecklistItems(list.id), productId, quantity);
  saveCustomChecklistItems(list.id, entries);
}

export async function updateChecklistListItemQty(
  userId: string,
  list: UserChecklistListMeta,
  productId: string,
  quantity: number,
): Promise<void> {
  const qty = Math.max(1, Math.floor(quantity));
  if (list.kind === 'room' && list.roomId) {
    const entries = loadLocalShoppingList(list.roomId).map((e) =>
      e.productId === productId ? { ...e, quantity: qty } : e,
    );
    saveLocalShoppingList(entries, list.roomId);
    const row = entries.find((e) => e.productId === productId);
    if (row) await upsertShoppingListEntry(userId, list.roomId, row);
    return;
  }
  const entries = loadCustomChecklistItems(list.id).map((e) =>
    e.productId === productId ? { ...e, quantity: qty } : e,
  );
  saveCustomChecklistItems(list.id, entries);
}

export async function removeChecklistListItem(
  userId: string,
  list: UserChecklistListMeta,
  productId: string,
): Promise<void> {
  if (list.kind === 'room' && list.roomId) {
    const entries = loadLocalShoppingList(list.roomId).filter((e) => e.productId !== productId);
    saveLocalShoppingList(entries, list.roomId);
    await removeShoppingListEntry(userId, list.roomId, productId);
    return;
  }
  const entries = loadCustomChecklistItems(list.id).filter((e) => e.productId !== productId);
  saveCustomChecklistItems(list.id, entries);
}
