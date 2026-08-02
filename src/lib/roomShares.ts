import { supabase } from './supabase';
import { signShareAssetPaths, urlFromShareMap } from './shareAssets';
import {
  dbRowToItem,
  type RoomItemRow,
} from './roomLayoutSerialize';
import { parseEnvironment } from './environmentPersist';
import { parseFloorPlan, DEFAULT_ROOM_GEOMETRY, type RoomGeometry } from './roomGeometry';
import { DEFAULT_ENVIRONMENT, type Item, type RoomEnvironment } from '../store';
import { mapProduct } from './shoppingCatalog';
import type { CuratedProduct } from './dormChecklist';
import { productImagePublicUrl } from './dormChecklist';

export type ShareRole = 'viewer' | 'editor';

export interface SharedRoomPayload {
  room: {
    id: string;
    name: string;
    environment: unknown;
    room_geometry: unknown;
    fork_count?: number;
    thumbnail_path?: string | null;
  };
  items: RoomItemRow[];
  catalog_dims?: Record<string, [number, number, number] | number[]>;
  published_products?: Record<string, Record<string, unknown>>;
  asset_paths?: string[];
  role: ShareRole;
  allow_copy: boolean;
  owner_display?: string;
  owner_handle?: string | null;
}

export interface SharedRoomLoadResult {
  roomId: string;
  roomName: string;
  role: ShareRole;
  allowCopy: boolean;
  ownerDisplay: string;
  items: Item[];
  order: string[];
  environment: RoomEnvironment;
  roomGeometry: RoomGeometry;
  productsById: Record<string, CuratedProduct>;
}

function buildSharePath(token: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${base}/r/${encodeURIComponent(token)}`;
}

export function buildShareUrl(token: string): string {
  if (typeof window === 'undefined') return buildSharePath(token);
  return `${window.location.origin}${buildSharePath(token)}`;
}

export function parseShareTokenFromPath(pathname: string): string | null {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const match = path.match(/^\/r\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export async function fetchSharedRoom(token: string): Promise<SharedRoomPayload> {
  const { data, error } = await supabase.rpc('get_shared_room', { p_token: token });
  if (error) throw new Error(error.message || 'Invalid share link');
  return data as SharedRoomPayload;
}

export async function createRoomShare(
  roomId: string,
  opts?: { role?: ShareRole; allowCopy?: boolean },
): Promise<{ token: string; url: string }> {
  const { data: tokenData, error: tokenErr } = await supabase.rpc('gen_share_token');
  if (tokenErr) throw new Error(tokenErr.message);
  const token = String(tokenData);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to create a share link');

  const { error } = await supabase.from('room_shares').insert({
    token,
    room_id: roomId,
    role: opts?.role ?? 'viewer',
    allow_copy: opts?.allowCopy ?? true,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  return { token, url: buildShareUrl(token) };
}

export async function listRoomShares(roomId: string) {
  const { data, error } = await supabase
    .from('room_shares')
    .select('token,role,allow_copy,created_at,revoked_at,view_count')
    .eq('room_id', roomId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function revokeRoomShare(token: string): Promise<void> {
  const { error } = await supabase
    .from('room_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token', token);
  if (error) throw new Error(error.message);
}

export async function redeemShareToken(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_share_token', { p_token: token });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function forkSharedRoom(token: string, name?: string): Promise<string> {
  const { data, error } = await supabase.rpc('fork_shared_room', {
    p_token: token,
    p_name: name ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function loadSharedRoomLayout(token: string): Promise<SharedRoomLoadResult> {
  const payload = await fetchSharedRoom(token);
  const urls = await signShareAssetPaths(token);

  const environment = parseEnvironment(payload.room.environment) ?? { ...DEFAULT_ENVIRONMENT };
  const roomGeometry =
    parseFloorPlan(payload.room.room_geometry) ?? DEFAULT_ROOM_GEOMETRY;

  const items: Item[] = [];
  const order: string[] = [];
  for (const row of payload.items ?? []) {
    const item = dbRowToItem(row);
    if (!item) continue;

    if (item.kind === 'imported' && item.importedStoragePath && !item.importedUrl) {
      const signed = urlFromShareMap(item.importedStoragePath, urls);
      if (signed) item.importedUrl = signed;
    }
    if (item.kind === 'bed' && item.blanketTexturePath && !item.blanketTextureUrl) {
      const signed = urlFromShareMap(item.blanketTexturePath, urls);
      if (signed) item.blanketTextureUrl = signed;
    }

    const dims = payload.catalog_dims?.[item.importedStoragePath ?? ''];
    if (dims && Array.isArray(dims) && dims.length === 3) {
      item.catalogSizeIn = [Number(dims[0]), Number(dims[1]), Number(dims[2])];
    }

    items.push(item);
    order.push(item.id);
  }

  const productsById: Record<string, CuratedProduct> = {};
  for (const [id, raw] of Object.entries(payload.published_products ?? {})) {
    const mapped = mapProduct({
      ...raw,
      id: raw.id ?? id,
      category_id: raw.category_id ?? 'shared',
      slug: raw.slug ?? id,
      sort_order: raw.sort_order ?? 0,
      published: true,
    });
    if (!mapped.imageUrl && mapped.imagePath) {
      mapped.imageUrl = productImagePublicUrl(mapped.imagePath);
    }
    productsById[id] = mapped;
  }

  return {
    roomId: payload.room.id,
    roomName: payload.room.name,
    role: payload.role,
    allowCopy: Boolean(payload.allow_copy),
    ownerDisplay: payload.owner_display ?? 'Toova designer',
    items,
    order,
    environment,
    roomGeometry,
    productsById,
  };
}
