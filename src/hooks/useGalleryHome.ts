import { useCallback, useEffect, useState } from 'react';
import {
  fetchGalleryHome,
  type GalleryRoomRow,
} from '../lib/roomGallery';
import { signRoomThumbnailPath } from '../lib/roomThumbnailStorage';
import { parseFloorPlan } from '../lib/floorPlanGeometry';
import type { GalleryModel } from './useGalleryCatalog';
import type { GalleryRoom } from './useGalleryRooms';
import { mapPreviewItems } from './useGalleryRooms';
import type { CatalogCategorySlug } from '../lib/catalogCategories';
import type { CatalogVisibility } from '../lib/catalogEngagement';
import { signBrowsableModelPath } from '../lib/modelStorage';
import { getSessionCatalogPreview } from '../lib/catalogThumbnailBackfill';

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

async function hydrateRoom(row: GalleryRoomRow): Promise<GalleryRoom> {
  const thumb = row.thumbnail_path?.trim() || null;
  const thumbnailUrl = thumb ? await signRoomThumbnailPath(thumb) : null;
  const visibilityRaw = String(row.visibility ?? 'public');
  const visibility =
    visibilityRaw === 'private' || visibilityRaw === 'unlisted'
      ? visibilityRaw
      : 'public';
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
    previewItems: mapPreviewItems(row.preview_items),
  };
}

async function hydrateModel(row: Record<string, unknown>): Promise<GalleryModel | null> {
  const kind = String(row.kind ?? '');
  if (!kind) return null;
  const visibilityRaw = String(row.visibility ?? 'private');
  const visibility: CatalogVisibility =
    visibilityRaw === 'public' || visibilityRaw === 'unlisted'
      ? visibilityRaw
      : 'private';
  const isBuiltin = Boolean(row.is_builtin);
  const path = String(row.model_url ?? '').trim();
  const isAbsolute = path.startsWith('http://') || path.startsWith('https://');
  let signedUrl: string | null = null;
  let previewUrl: string | null = null;

  if (isBuiltin) {
    previewUrl = getSessionCatalogPreview(kind) ?? null;
  } else if (path) {
    signedUrl = isAbsolute ? path : await signBrowsableModelPath(path);
    if (!signedUrl) return null;
    const thumbPath = String(row.thumbnail_path ?? '').trim();
    if (thumbPath) {
      previewUrl = await signBrowsableModelPath(thumbPath);
    } else {
      previewUrl = getSessionCatalogPreview(kind) ?? null;
    }
  } else {
    return null;
  }

  return {
    kind,
    label: String(row.label ?? kind),
    description: (row.description as string | null) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    categories: Array.isArray(row.categories)
      ? (row.categories as CatalogCategorySlug[])
      : [],
    width_in: n(row.width_in),
    height_in: n(row.height_in),
    depth_in: n(row.depth_in),
    clearance_in:
      row.clearance_in != null && row.clearance_in !== ''
        ? n(row.clearance_in)
        : null,
    userId: (row.user_id as string | null) ?? null,
    visibility,
    isBuiltin,
    likesCount: n(row.likes_count),
    downloadsCount: n(row.downloads_count),
    viewsCount: n(row.views_count),
    createdAt: String(row.created_at ?? ''),
    creatorHandle: (row.creator_handle as string | null) ?? null,
    creatorDisplayName: (row.creator_display_name as string | null) ?? null,
    likedByMe: Boolean(row.liked_by_me),
    hotScore: n(row.hot_score),
    storagePath: isAbsolute ? '' : path,
    signedUrl,
    previewUrl,
  };
}

export interface GalleryHomeData {
  roomsHot: GalleryRoom[];
  roomsLiked: GalleryRoom[];
  modelsHot: GalleryModel[];
  modelsLiked: GalleryModel[];
}

export function useGalleryHome(enabled: boolean) {
  const [data, setData] = useState<GalleryHomeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchGalleryHome(12, 12);
      const [roomsHot, roomsLiked, modelsHot, modelsLiked] = await Promise.all([
        Promise.all(raw.rooms_hot.map(hydrateRoom)),
        Promise.all(raw.rooms_likes.map(hydrateRoom)),
        Promise.all(raw.models_hot.map(hydrateModel)).then((list) =>
          list.filter((m): m is GalleryModel => !!m),
        ),
        Promise.all(raw.models_likes.map(hydrateModel)).then((list) =>
          list.filter((m): m is GalleryModel => !!m),
        ),
      ]);

      setData({
        roomsHot,
        roomsLiked,
        modelsHot,
        modelsLiked,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load gallery');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patchModel = useCallback((kind: string, patch: Partial<GalleryModel>) => {
    setData((prev) => {
      if (!prev) return prev;
      const patchList = (list: GalleryModel[]) =>
        list.map((m) => (m.kind === kind ? { ...m, ...patch } : m));
      return {
        ...prev,
        modelsHot: patchList(prev.modelsHot),
        modelsLiked: patchList(prev.modelsLiked),
      };
    });
  }, []);

  return { data, loading, error, refresh, patchModel };
}
