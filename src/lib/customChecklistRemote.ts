import { supabase } from './supabase';
import type { ShoppingListEntry } from './dormChecklist';
import { normalizeShoppingListEntry } from './shoppingListEntry';
import type { UserChecklistListMeta } from './userChecklistLists';
import {
  CUSTOM_CHECKLIST_ITEMS_KEY,
  loadCustomChecklistItems,
  loadCustomChecklistLists,
  saveCustomChecklistLists,
} from './userChecklistLists';

const MIGRATED_KEY = 'toova-custom-lists-migrated:v1';

export async function fetchRemoteCustomLists(userId: string): Promise<UserChecklistListMeta[]> {
  const { data, error } = await supabase
    .from('user_custom_checklist_lists')
    .select('id,name,created_at,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    kind: 'custom' as const,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export async function fetchRemoteCustomListItems(listId: string): Promise<ShoppingListEntry[]> {
  const { data, error } = await supabase
    .from('user_custom_checklist_items')
    .select('product_id,quantity,review_done')
    .eq('list_id', listId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) =>
    normalizeShoppingListEntry({
      productId: String(row.product_id),
      manualQuantity: Number(row.quantity) > 0 ? Number(row.quantity) : 1,
      reviewDone: row.review_done === true,
    }),
  );
}

export async function upsertRemoteCustomList(
  userId: string,
  list: UserChecklistListMeta,
): Promise<void> {
  const { error } = await supabase.from('user_custom_checklist_lists').upsert(
    {
      id: list.id,
      user_id: userId,
      name: list.name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message);
}

export async function upsertRemoteCustomListItem(
  userId: string,
  listId: string,
  entry: ShoppingListEntry,
): Promise<void> {
  const normalized = normalizeShoppingListEntry(entry);
  const { error } = await supabase.from('user_custom_checklist_items').upsert(
    {
      user_id: userId,
      list_id: listId,
      product_id: normalized.productId,
      quantity: normalized.quantity,
      review_done: normalized.reviewDone,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'list_id,product_id' },
  );
  if (error) throw new Error(error.message);
}

export async function deleteRemoteCustomList(userId: string, listId: string): Promise<void> {
  const { error } = await supabase
    .from('user_custom_checklist_lists')
    .delete()
    .eq('user_id', userId)
    .eq('id', listId);
  if (error) throw new Error(error.message);
}

function customItemsKey(listId: string): string {
  return `${CUSTOM_CHECKLIST_ITEMS_KEY}:${listId}`;
}

/** One-time push of browser-only custom lists into Supabase. */
export async function migrateLocalCustomListsToAccount(userId: string): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATED_KEY) === '1') return;
  } catch {
    return;
  }
  const local = loadCustomChecklistLists(userId).filter((l) => l.kind === 'custom');
  for (const list of local) {
    await upsertRemoteCustomList(userId, list);
    const items = loadCustomChecklistItems(list.id);
    for (const entry of items) {
      await upsertRemoteCustomListItem(userId, list.id, entry);
    }
  }
  try {
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    /* ignore */
  }
}

export async function pullRemoteCustomListsIntoLocal(userId: string): Promise<void> {
  const remote = await fetchRemoteCustomLists(userId);
  const localOnly = loadCustomChecklistLists(userId).filter((l) => l.kind === 'custom');
  const byId = new Map(localOnly.map((l) => [l.id, l]));
  for (const row of remote) byId.set(row.id, row);
  saveCustomChecklistLists(userId, [...byId.values()]);
  for (const list of remote) {
    const items = await fetchRemoteCustomListItems(list.id);
    try {
      localStorage.setItem(customItemsKey(list.id), JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }
}