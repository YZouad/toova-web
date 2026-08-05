import { supabase } from './supabase';

export { roomHotScore } from './roomGalleryHelpers';

export type RoomGallerySort = 'hot' | 'likes' | 'views' | 'clones' | 'newest';
export type RoomGallerySource = 'community' | 'mine';

export interface GalleryRoomRow {
  room_id: string;
  name: string;
  thumbnail_path: string | null;
  user_id: string;
  visibility: string;
  likes_count: number;
  views_count: number;
  fork_count: number;
  published_at: string;
  updated_at: string;
  creator_handle: string | null;
  creator_display_name: string | null;
  liked_by_me: boolean;
  hot_score: number;
  room_geometry: unknown;
  preview_items: unknown[];
  total_count: number;
}

export interface FetchGalleryRoomsParams {
  source?: RoomGallerySource;
  sort?: RoomGallerySort;
  query?: string | null;
  limit?: number;
  offset?: number;
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function mapGalleryRoomRow(row: Record<string, unknown>): GalleryRoomRow {
  return {
    room_id: String(row.room_id ?? ''),
    name: String(row.name ?? 'Room'),
    thumbnail_path: (row.thumbnail_path as string | null) ?? null,
    user_id: String(row.user_id ?? ''),
    visibility: String(row.visibility ?? 'public'),
    likes_count: n(row.likes_count),
    views_count: n(row.views_count),
    fork_count: n(row.fork_count),
    published_at: String(row.published_at ?? row.updated_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    creator_handle: (row.creator_handle as string | null) ?? null,
    creator_display_name: (row.creator_display_name as string | null) ?? null,
    liked_by_me: Boolean(row.liked_by_me),
    hot_score: n(row.hot_score),
    room_geometry: row.room_geometry ?? null,
    preview_items: Array.isArray(row.preview_items) ? row.preview_items : [],
    total_count: n(row.total_count),
  };
}

export async function fetchGalleryRooms(
  params: FetchGalleryRoomsParams = {},
): Promise<{ rows: GalleryRoomRow[]; total: number }> {
  const source = params.source ?? 'community';
  const { data, error } = await supabase.rpc('get_gallery_rooms', {
    p_sort: source === 'mine' ? 'newest' : (params.sort ?? 'hot'),
    p_query: params.query ?? null,
    p_limit: params.limit ?? 48,
    p_offset: params.offset ?? 0,
    p_source: source,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((r: Record<string, unknown>) => mapGalleryRoomRow(r));
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export interface GalleryHomePayload {
  rooms_hot: GalleryRoomRow[];
  rooms_likes: GalleryRoomRow[];
  models_hot: Record<string, unknown>[];
  models_likes: Record<string, unknown>[];
}

function mapRoomList(raw: unknown): GalleryRoomRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => mapGalleryRoomRow(r as Record<string, unknown>));
}

export async function fetchGalleryHome(
  roomLimit = 12,
  modelLimit = 12,
): Promise<GalleryHomePayload> {
  const { data, error } = await supabase.rpc('get_gallery_home', {
    p_room_limit: roomLimit,
    p_model_limit: modelLimit,
  });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    rooms_hot: mapRoomList(payload.rooms_hot),
    rooms_likes: mapRoomList(payload.rooms_likes),
    models_hot: Array.isArray(payload.models_hot)
      ? (payload.models_hot as Record<string, unknown>[])
      : [],
    models_likes: Array.isArray(payload.models_likes)
      ? (payload.models_likes as Record<string, unknown>[])
      : [],
  };
}
