import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseEnvironment } from '../lib/environmentPersist';
import { parseFloorPlan, serializeFloorPlan, DEFAULT_ROOM_GEOMETRY, type RoomGeometry } from '../lib/roomGeometry';
import {
  dbRowToItem,
  serializeLayoutForRoom,
  type RoomItemRow,
} from '../lib/roomLayoutSerialize';
import { signModelObjectPath } from '../lib/modelStorage';
import { patchImportedItemsFromCatalog } from '../lib/patchImportedFromCatalog';
import type { Item, RoomEnvironment } from '../store';
import { DEFAULT_ENVIRONMENT, useStore } from '../store';

export interface RoomLoadResult {
  items: Item[];
  order: string[];
  environment: RoomEnvironment;
  roomGeometry: RoomGeometry;
}

export async function loadRoomLayout(roomId: string): Promise<RoomLoadResult> {
  const [{ data: roomRow, error: roomErr }, { data: itemRows, error: itemErr }] = await Promise.all([
    supabase.from('rooms').select('environment, room_geometry').eq('id', roomId).single(),
    supabase.from('room_items').select('*').eq('room_id', roomId).order('sort_order', { ascending: true }),
  ]);

  if (roomErr) throw new Error(formatRoomDbError(roomErr.message));
  if (itemErr) throw new Error(itemErr.message);

  const environment = parseEnvironment(roomRow?.environment) ?? { ...DEFAULT_ENVIRONMENT };
  const roomGeometry = parseFloorPlan(roomRow?.room_geometry) ?? DEFAULT_ROOM_GEOMETRY;

  const rows = (itemRows ?? []) as RoomItemRow[];
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

  return {
    items,
    order,
    environment,
    roomGeometry: roomGeometry!,
  };
}

export async function saveRoomLayout(
  roomId: string,
  items: Record<string, Item>,
  order: string[],
  environment?: RoomEnvironment,
  roomGeometry?: RoomGeometry,
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

  const roomUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (environment) roomUpdate.environment = environment;
  if (roomGeometry) roomUpdate.room_geometry = serializeFloorPlan(roomGeometry);

  const { error: upErr } = await supabase.from('rooms').update(roomUpdate).eq('id', roomId);

  if (upErr) throw new Error(formatRoomDbError(upErr.message));
}

const ROOM_SCHEMA_MIGRATION_HINT =
  'Run supabase/sql/add_room_environment_geometry_emitter.sql in the Supabase SQL Editor (Dashboard → SQL).';

function formatRoomDbError(message: string): string {
  if (
    message.includes("'environment'") ||
    message.includes("'room_geometry'") ||
    message.includes('schema cache')
  ) {
    return `Database is missing room layout columns. ${ROOM_SCHEMA_MIGRATION_HINT}`;
  }
  return message;
}

export async function createRoomWithGeometry(
  userId: string,
  name: string,
  roomGeometry: RoomGeometry,
  environment = DEFAULT_ENVIRONMENT,
): Promise<{ id: string; name: string }> {
  const { data, error } = await supabase
    .from('rooms')
    .insert({
      user_id: userId,
      name,
      room_geometry: serializeFloorPlan(roomGeometry),
      environment,
    })
    .select('id,name')
    .single();
  if (error) throw new Error(formatRoomDbError(error.message));
  return { id: data.id, name: data.name ?? name };
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
    const { items, order, environment, roomGeometry } = useStore.getState();
    setSaving(true);
    setError(null);
    try {
      await saveRoomLayout(roomId, items, order, environment, roomGeometry);
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
