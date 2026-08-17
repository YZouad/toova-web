import { useCallback, useState } from 'react';
import { trackCreateRoom } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { parseEnvironment } from '../lib/environmentPersist';
import { parseFloorPlan, serializeFloorPlan, DEFAULT_ROOM_GEOMETRY, type RoomGeometry } from '../lib/roomGeometry';
import {
  dbRowToItem,
  serializeLayoutForRoom,
  type RoomItemRow,
} from '../lib/roomLayoutSerialize';
import {
  publicModelAssetUrl,
  resolveBrowsableModelUrl,
  signModelObjectPath,
} from '../lib/modelStorage';
import {
  applyCatalogSizes,
  catalogDimsFromRpc,
  patchImportedItemsFromCatalog,
} from '../lib/patchImportedFromCatalog';
import {
  fetchSharedRoom,
  signGrantedAssetPaths,
  type PublicAttribution,
  type ShareRole,
} from '../lib/roomShares';
import {
  fetchPublicRoom,
  fetchRoomAttribution,
  signPublicRoomAssetPaths,
  type RoomAttributionPayload,
} from '../lib/profiles';
import { mirrorRoomAssets } from '../lib/publicModelsMirror';
import type { Item, RoomEnvironment } from '../store';
import { DEFAULT_ENVIRONMENT, useStore } from '../store';

export interface RoomLoadResult {
  items: Item[];
  order: string[];
  environment: RoomEnvironment;
  roomGeometry: RoomGeometry;
  forkMeta?: RoomAttributionPayload | null;
}

export interface SharedRoomLoadResult extends RoomLoadResult {
  roomId: string;
  roomName: string;
  role: ShareRole;
  allowCopy: boolean;
  ownerDisplay: string;
  ownerHandle: string | null;
  forkCount: number;
  attribution: PublicAttribution | null;
}

export interface PublicRoomLoadResult extends RoomLoadResult {
  roomId: string;
  roomName: string;
  allowCopy: boolean;
  forkCount: number;
  likesCount: number;
  viewsCount: number;
  likedByMe: boolean;
  ownerId: string | null;
  attribution: PublicAttribution | null;
  owner: {
    handle: string;
    displayName: string;
    avatarPath: string | null;
  };
}

export async function loadRoomLayout(roomId: string): Promise<RoomLoadResult> {
  const [{ data: roomRow, error: roomErr }, { data: itemRows, error: itemErr }] = await Promise.all([
    supabase
      .from('rooms')
      .select('environment, room_geometry, forked_from, fork_count, visibility')
      .eq('id', roomId)
      .single(),
    supabase.from('room_items').select('*').eq('room_id', roomId).order('sort_order', { ascending: true }),
  ]);

  if (roomErr) throw new Error(formatRoomDbError(roomErr.message));
  if (itemErr) throw new Error(itemErr.message);

  const environment = parseEnvironment(roomRow?.environment) ?? { ...DEFAULT_ENVIRONMENT };
  const roomGeometry = parseFloorPlan(roomRow?.room_geometry) ?? DEFAULT_ROOM_GEOMETRY;

  let forkMeta: RoomAttributionPayload | null = null;
  try {
    forkMeta = await fetchRoomAttribution(roomId);
  } catch {
    forkMeta = {
      forked_from: (roomRow?.forked_from as string | null) ?? null,
      fork_count: Number(roomRow?.fork_count ?? 0),
      visibility: String(roomRow?.visibility ?? 'private'),
      attribution: null,
    };
  }

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
        const url = await resolveBrowsableModelUrl(item.importedStoragePath);
        if (url) {
          item.importedUrl = url;
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
    forkMeta,
  };
}

/** Load via share token RPC; uses grant-gated signed URLs (works for anon). */
export async function loadSharedRoomLayout(token: string): Promise<SharedRoomLoadResult> {
  const payload = await fetchSharedRoom(token);
  const signedAssets = await signGrantedAssetPaths(payload.asset_paths ?? []);

  const environment = parseEnvironment(payload.room.environment) ?? { ...DEFAULT_ENVIRONMENT };
  const roomGeometry = parseFloorPlan(payload.room.room_geometry) ?? DEFAULT_ROOM_GEOMETRY;

  const items: Item[] = [];
  const order: string[] = [];
  const rows = (payload.items ?? []) as RoomItemRow[];

  for (const row of rows) {
    const item = dbRowToItem(row);
    if (!item) continue;
    if (item.kind === 'imported' && item.importedStoragePath) {
      item.importedUrl =
        publicModelAssetUrl(item.importedStoragePath) ??
        signedAssets[item.importedStoragePath];
    }
    if (item.kind === 'bed' && item.blanketTexturePath) {
      const signed = signedAssets[item.blanketTexturePath];
      if (signed) item.blanketTextureUrl = signed;
    }
    items.push(item);
    order.push(item.id);
  }

  applyCatalogSizes(items, catalogDimsFromRpc(payload.catalog_dims));

  return {
    items,
    order,
    environment,
    roomGeometry,
    roomId: payload.room.id,
    roomName: payload.room.name,
    role: payload.role,
    allowCopy: payload.allow_copy,
    ownerDisplay: payload.owner_display,
    ownerHandle: payload.owner_handle ?? null,
    forkCount: Number(payload.room.fork_count ?? 0),
    attribution: payload.attribution ?? null,
  };
}

export interface LoadPublicRoomOptions {
  /**
   * Map storage object keys → same-origin public/ paths (or absolute URLs).
   * Matching assets skip createSignedUrl so landing-page snapshots do not
   * count against Supabase Storage egress.
   */
  assetUrlOverrides?: Record<string, string>;
}

function resolveRoomAssetUrl(
  storagePath: string,
  signedAssets: Record<string, string>,
  overrides: Record<string, string>,
): string | undefined {
  const override = overrides[storagePath];
  return (
    publicModelAssetUrl(storagePath) ??
    (override ? publicModelAssetUrl(override) ?? override : null) ??
    signedAssets[storagePath]
  );
}

/** Load a published profile room (works for anon via path-scoped storage policy). */
export async function loadPublicRoomLayout(
  handle: string,
  roomId: string,
  options?: LoadPublicRoomOptions,
): Promise<PublicRoomLoadResult> {
  const payload = await fetchPublicRoom(handle, roomId);
  const overrides = options?.assetUrlOverrides ?? {};
  const toSign = (payload.asset_paths ?? []).filter((raw) => {
    const path = raw.trim();
    if (!path) return false;
    if (publicModelAssetUrl(path)) return false;
    const override = overrides[path];
    if (override && (publicModelAssetUrl(override) || override.startsWith('http'))) {
      return false;
    }
    return true;
  });
  const signedAssets = await signPublicRoomAssetPaths(toSign);

  const environment = parseEnvironment(payload.room.environment) ?? { ...DEFAULT_ENVIRONMENT };
  const roomGeometry = parseFloorPlan(payload.room.room_geometry) ?? DEFAULT_ROOM_GEOMETRY;

  const items: Item[] = [];
  const order: string[] = [];
  const rows = (payload.items ?? []) as RoomItemRow[];

  for (const row of rows) {
    const item = dbRowToItem(row);
    if (!item) continue;
    if (item.kind === 'imported' && item.importedStoragePath) {
      item.importedUrl = resolveRoomAssetUrl(
        item.importedStoragePath,
        signedAssets,
        overrides,
      );
    }
    if (item.kind === 'bed' && item.blanketTexturePath) {
      const url = resolveRoomAssetUrl(
        item.blanketTexturePath,
        signedAssets,
        overrides,
      );
      if (url) item.blanketTextureUrl = url;
    }
    items.push(item);
    order.push(item.id);
  }

  applyCatalogSizes(items, catalogDimsFromRpc(payload.catalog_dims));

  return {
    items,
    order,
    environment,
    roomGeometry,
    roomId: payload.room.id,
    roomName: payload.room.name,
    allowCopy: payload.allow_copy,
    forkCount: Number(payload.room.fork_count ?? 0),
    likesCount: Number(payload.room.likes_count ?? 0),
    viewsCount: Number(payload.room.views_count ?? 0),
    likedByMe: Boolean(payload.room.liked_by_me),
    ownerId: payload.owner.id ?? null,
    attribution: payload.attribution ?? null,
    owner: {
      handle: payload.owner.handle,
      displayName: payload.owner.display_name,
      avatarPath: payload.owner.avatar_path,
    },
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

  const { data: room } = await supabase
    .from('rooms')
    .select('visibility')
    .eq('id', roomId)
    .maybeSingle();
  if (room?.visibility === 'public') {
    await mirrorRoomAssets(roomId, 'public');
  }
}

const ROOM_SCHEMA_MIGRATION_HINT =
  'Run supabase/sql/add_room_environment_geometry_emitter.sql and supabase/sql/hanging_decorations.sql in the Supabase SQL Editor (Dashboard → SQL).';

function formatRoomDbError(message: string): string {
  if (
    message.includes("'environment'") ||
    message.includes("'room_geometry'") ||
    message.includes("'instance_key'") ||
    message.includes("'hanging_config'") ||
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
  trackCreateRoom();
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
