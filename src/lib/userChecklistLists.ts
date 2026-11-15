import {
  loadLocalShoppingList,
  saveLocalShoppingList,
  type ShoppingListEntry,
} from './dormChecklist';
import { syncShoppingListEntries } from './shoppingCatalog';
import { normalizeShoppingListEntry } from './shoppingListEntry';
import type { RoomTag } from './roomTags';

export const USER_CHECKLIST_LISTS_KEY = 'toova-user-checklist-lists';
export const CUSTOM_CHECKLIST_ITEMS_KEY = 'toova-custom-checklist-items';
const PREFERRED_CHECKLIST_LIST_KEY = 'toova-preferred-checklist-list';

function preferredListStorageKey(userId: string): string {
  return `${PREFERRED_CHECKLIST_LIST_KEY}:${userId}`;
}

export function loadPreferredChecklistListId(userId: string): string | null {
  try {
    const raw = localStorage.getItem(preferredListStorageKey(userId));
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function savePreferredChecklistListId(userId: string, listId: string): void {
  try {
    localStorage.setItem(preferredListStorageKey(userId), listId);
  } catch {
    /* ignore */
  }
}

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

export function saveCustomChecklistLists(userId: string, lists: UserChecklistListMeta[]): void {
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
        return normalizeShoppingListEntry({
          productId: o.productId,
          manualQuantity: quantity,
          reviewDone: o.reviewDone === true,
        });
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

function mergeManualEntry(
  entries: ShoppingListEntry[],
  productId: string,
  quantity: number,
): ShoppingListEntry[] {
  const qty = Math.max(1, Math.floor(quantity));
  const idx = entries.findIndex((e) => e.productId === productId);
  if (idx >= 0) {
    const next = [...entries];
    next[idx] = normalizeShoppingListEntry({
      ...next[idx],
      manualQuantity: Math.max(next[idx].manualQuantity, qty),
    });
    return next;
  }
  return [
    ...entries,
    normalizeShoppingListEntry({
      productId,
      manualQuantity: qty,
      roomQuantity: 0,
      reviewDone: false,
    }),
  ];
}

export async function addProductToChecklistList(
  userId: string,
  list: UserChecklistListMeta,
  productId: string,
  quantity = 1,
): Promise<void> {
  if (list.kind === 'room' && list.roomId) {
    const prev = loadLocalShoppingList(list.roomId);
    const entries = mergeManualEntry(prev, productId, quantity);
    saveLocalShoppingList(entries, list.roomId);
    await syncShoppingListEntries(userId, list.roomId, entries, prev);
    return;
  }
  const entries = mergeManualEntry(loadCustomChecklistItems(list.id), productId, quantity);
  saveCustomChecklistItems(list.id, entries);
  const { upsertRemoteCustomListItem } = await import('./customChecklistRemote');
  const row = entries.find((e) => e.productId === productId);
  if (row) await upsertRemoteCustomListItem(userId, list.id, row);
}

export async function updateChecklistListItemQty(
  userId: string,
  list: UserChecklistListMeta,
  productId: string,
  quantity: number,
): Promise<void> {
  const qty = Math.max(1, Math.floor(quantity));
  if (list.kind === 'room' && list.roomId) {
    const prev = loadLocalShoppingList(list.roomId);
    const entries = prev.map((e) => {
      if (e.productId !== productId) return e;
      return normalizeShoppingListEntry({
        ...e,
        manualQuantity: Math.max(e.roomQuantity, qty),
      });
    });
    saveLocalShoppingList(entries, list.roomId);
    await syncShoppingListEntries(userId, list.roomId, entries, prev);
    return;
  }
  const entries = loadCustomChecklistItems(list.id).map((e) =>
    e.productId === productId
      ? normalizeShoppingListEntry({ ...e, manualQuantity: qty })
      : e,
  );
  saveCustomChecklistItems(list.id, entries);
}

export async function removeChecklistListItem(
  userId: string,
  list: UserChecklistListMeta,
  productId: string,
): Promise<void> {
  if (list.kind === 'room' && list.roomId) {
    const prev = loadLocalShoppingList(list.roomId);
    const existing = prev.find((e) => e.productId === productId);
    const entries = existing?.roomQuantity
      ? prev.map((e) =>
          e.productId === productId
            ? normalizeShoppingListEntry({ ...e, manualQuantity: 0 })
            : e,
        )
      : prev.filter((e) => e.productId !== productId);
    saveLocalShoppingList(entries, list.roomId);
    await syncShoppingListEntries(userId, list.roomId, entries, prev);
    return;
  }
  const entries = loadCustomChecklistItems(list.id).filter((e) => e.productId !== productId);
  saveCustomChecklistItems(list.id, entries);
}
