import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchGalleryRooms,
  type GalleryRoomRow,
  type RoomGallerySort,
} from '../lib/roomGallery';
import { signRoomThumbnailPath } from '../lib/roomThumbnailStorage';
import { parseFloorPlan, type FloorPlan } from '../lib/floorPlanGeometry';
import { resolvePreviewTintsForModelUrls } from '../lib/previewTintColor';
import type { RoomPreviewItem } from '../ui/RoomPreview';

export interface GalleryRoom {
  id: string;
  name: string;
  userId: string;
  visibility: 'private' | 'unlisted' | 'public';
  likesCount: number;
  viewsCount: number;
  forkCount: number;
  publishedAt: string;
  updatedAt: string;
  creatorHandle: string | null;
  creatorDisplayName: string | null;
  likedByMe: boolean;
  hotScore: number;
  thumbnailPath: string | null;
  thumbnailUrl: string | null;
  roomGeometry: FloorPlan | null;
  previewItems: RoomPreviewItem[];
}

export interface UseGalleryRoomsParams {
  enabled: boolean;
  source?: 'community' | 'mine';
  sort?: RoomGallerySort;
  query?: string;
  pageSize?: number;
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function mapPreviewItems(raw: unknown[]): RoomPreviewItem[] {
  const out: RoomPreviewItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? '');
    if (!id) continue;
    const kind = String(row.kind ?? 'imported');
    if (kind === 'hanging' || kind === 'light') continue;
    const modelUrl = String(row.model_url ?? '').trim() || null;
    out.push({
      id,
      kind,
      position: [n(row.pos_x), n(row.pos_y), n(row.pos_z)],
      rotationY: n(row.rotation_y),
      size: [n(row.size_w) || 24, n(row.size_h) || 24, n(row.size_d) || 24],
      ...(modelUrl ? { modelUrl } : {}),
    });
  }
  return out;
}

/** Attach average-thumbnail tints to imported preview items. */
export async function withPreviewTints(
  items: RoomPreviewItem[],
): Promise<RoomPreviewItem[]> {
  const modelUrls = items
    .filter((it) => it.kind === 'imported')
    .map((it) => it.modelUrl || '')
    .filter(Boolean);
  if (modelUrls.length === 0) return items;
  const tints = await resolvePreviewTintsForModelUrls(modelUrls);
  return items.map((it) => {
    if (it.kind !== 'imported' || !it.modelUrl) return it;
    const tint = tints.get(it.modelUrl);
    return tint ? { ...it, tint } : it;
  });
}

async function rowToRoom(row: GalleryRoomRow): Promise<GalleryRoom> {
  const thumb = row.thumbnail_path?.trim() || null;
  const thumbnailUrl = thumb ? await signRoomThumbnailPath(thumb) : null;
  const visibilityRaw = String(row.visibility ?? 'public');
  const visibility =
    visibilityRaw === 'private' || visibilityRaw === 'unlisted'
      ? visibilityRaw
      : 'public';
  const previewItems = await withPreviewTints(mapPreviewItems(row.preview_items));
  return {
    id: row.room_id,
    name: row.name,
    userId: row.user_id,
    visibility,
    likesCount: row.likes_count,
    viewsCount: row.views_count,
    forkCount: row.fork_count,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    creatorHandle: row.creator_handle,
    creatorDisplayName: row.creator_display_name,
    likedByMe: row.liked_by_me,
    hotScore: row.hot_score,
    thumbnailPath: thumb,
    thumbnailUrl,
    roomGeometry: parseFloorPlan(row.room_geometry),
    previewItems,
  };
}

export function useGalleryRooms(params: UseGalleryRoomsParams) {
  const {
    enabled,
    source = 'community',
    sort = 'hot',
    query = '',
    pageSize = 48,
  } = params;
  const [rooms, setRooms] = useState<GalleryRoom[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);

  const patchRoom = useCallback((id: string, patch: Partial<GalleryRoom>) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }, []);

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!enabled) {
        setRooms([]);
        setTotal(0);
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await fetchGalleryRooms({
          source,
          sort: source === 'mine' ? 'newest' : sort,
          query,
          limit: pageSize,
          offset,
        });
        const mapped = await Promise.all(result.rows.map(rowToRoom));
        setTotal(result.total);
        setRooms((prev) => (append ? [...prev, ...mapped] : mapped));
        offsetRef.current = offset + result.rows.length;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load rooms');
        if (!append) {
          setRooms([]);
          setTotal(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [enabled, source, sort, query, pageSize],
  );

  const refresh = useCallback(async () => {
    offsetRef.current = 0;
    await loadPage(0, false);
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore) return;
    if (rooms.length >= total && total > 0) return;
    await loadPage(offsetRef.current, true);
  }, [loadPage, loading, loadingMore, rooms.length, total]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    rooms,
    total,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
    hasMore: rooms.length < total,
    patchRoom,
  };
}

export { rowToRoom };
