import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  dbRowToItem,
  serializeLayoutForRoom,
  type RoomItemRow,
} from '../lib/roomLayoutSerialize';
import { signModelObjectPath } from '../lib/modelStorage';
import { patchImportedItemsFromCatalog } from '../lib/patchImportedFromCatalog';
import type { Item } from '../store';
import { useStore } from '../store';

export async function loadRoomLayout(roomId: string): Promise<{
  items: Item[];
  order: string[];
}> {
  const { data, error } = await supabase
    .from('room_items')
    .select('*')
    .eq('room_id', roomId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as RoomItemRow[];
  const items: Item[] = [];
  const order: string[] = [];

  for (const row of rows) {
    const item = dbRowToItem(row);
    if (!item) continue;
    items.push(item);
    order.push(item.id);
  }

  await Promise.all(
    items.map(async (item) => {
      if (
        item.kind === 'imported' &&
        item.importedStoragePath &&
        !item.importedUrl
      ) {
        const signed = await signModelObjectPath(item.importedStoragePath);
        if (signed) {
          item.importedUrl = signed;
        }
      }
      if (
        item.kind === 'bed' &&
        item.blanketTexturePath &&
        !item.blanketTextureUrl
      ) {
        const signed = await signModelObjectPath(item.blanketTexturePath);
        if (signed) {
          item.blanketTextureUrl = signed;
        }
      }
    }),
  );

  await patchImportedItemsFromCatalog(items);

  return { items, order };
}

export async function saveRoomLayout(
  roomId: string,
  items: Record<string, Item>,
  order: string[],
): Promise<void> {
  const payload = serializeLayoutForRoom(roomId, items, order);

  const { error: delErr } = await supabase
    .from('room_items')
    .delete()
    .eq('room_id', roomId);

  if (delErr) throw new Error(delErr.message);

  if (payload.length > 0) {
    const { error: insErr } = await supabase.from('room_items').insert(payload);
    if (insErr) throw new Error(insErr.message);
  }

  const { error: upErr } = await supabase
    .from('rooms')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', roomId);

  if (upErr) throw new Error(upErr.message);
}

/** Imperative load — use from room picker. */
export function useRoomLoad() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (roomId: string) => {
    setLoading(true);
    setError(null);
    try {
      return await loadRoomLayout(roomId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load room';
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { load, loading, error };
}

export function useRoomSave(roomId: string | null) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    if (!roomId) return;
    const { items, order } = useStore.getState();
    setSaving(true);
    setError(null);
    try {
      await saveRoomLayout(roomId, items, order);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save room';
      setError(msg);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [roomId]);

  return { save, saving, error };
}
