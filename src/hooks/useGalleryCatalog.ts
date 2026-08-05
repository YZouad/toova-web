import { useCallback, useEffect, useRef, useState } from 'react';
import {
  enqueueCatalogThumbnailBackfill,
  getSessionCatalogPreview,
} from '../lib/catalogThumbnailBackfill';
import {
  fetchGalleryCatalog,
  type GalleryCatalogRow,
  type GallerySort,
  type GallerySource,
} from '../lib/galleryCatalog';
import { signBrowsableModelPath } from '../lib/modelStorage';
import type { CatalogVisibility } from '../lib/catalogEngagement';
import type { CatalogCategorySlug } from '../lib/catalogCategories';
import { BUILTIN_CATEGORIES } from '../lib/catalogCategories';
import { FURNITURE, type FurnitureKind } from '../furniture/registry';
import { supabase } from '../lib/supabase';

export interface GalleryModel {
  kind: string;
  label: string;
  description: string | null;
  tags: string[];
  categories: CatalogCategorySlug[];
  width_in: number;
  height_in: number;
  depth_in: number;
  clearance_in: number | null;
  userId: string | null;
  visibility: CatalogVisibility;
  isBuiltin: boolean;
  likesCount: number;
  downloadsCount: number;
  viewsCount: number;
  createdAt: string;
  creatorHandle: string | null;
  creatorDisplayName: string | null;
  likedByMe: boolean;
  hotScore: number;
  storagePath: string;
  signedUrl: string | null;
  previewUrl: string | null;
}

export interface UseGalleryCatalogParams {
  enabled: boolean;
  source: GallerySource;
  sort?: GallerySort;
  category?: string | null;
  query?: string;
  pageSize?: number;
}

function rowToModel(row: GalleryCatalogRow, signedUrl: string | null, previewUrl: string | null): GalleryModel {
  const path = row.model_url?.trim() ?? '';
  const isAbsolute = path.startsWith('http://') || path.startsWith('https://');
  return {
    kind: row.kind,
    label: row.label,
    description: row.description,
    tags: row.tags,
    categories: row.categories,
    width_in: row.width_in,
    height_in: row.height_in,
    depth_in: row.depth_in,
    clearance_in: row.clearance_in,
    userId: row.user_id,
    visibility: row.visibility,
    isBuiltin: row.is_builtin,
    likesCount: row.likes_count,
    downloadsCount: row.downloads_count,
    viewsCount: row.views_count,
    createdAt: row.created_at,
    creatorHandle: row.creator_handle,
    creatorDisplayName: row.creator_display_name,
    likedByMe: row.liked_by_me,
    hotScore: row.hot_score,
    storagePath: isAbsolute ? '' : path,
    signedUrl,
    previewUrl,
  };
}

async function resolveUrls(row: GalleryCatalogRow): Promise<{
  signedUrl: string | null;
  previewUrl: string | null;
}> {
  if (row.is_builtin) {
    return { signedUrl: null, previewUrl: getSessionCatalogPreview(row.kind) ?? null };
  }

  const path = row.model_url?.trim() ?? '';
  if (!path) return { signedUrl: null, previewUrl: null };

  const isAbsolute = path.startsWith('http://') || path.startsWith('https://');
  const signedUrl = isAbsolute ? path : await signBrowsableModelPath(path);
  if (!signedUrl) return { signedUrl: null, previewUrl: null };

  const thumbPath = row.thumbnail_path?.trim() ?? '';
  let previewUrl: string | null = null;
  if (thumbPath) {
    previewUrl = await signBrowsableModelPath(thumbPath);
  } else {
    previewUrl = getSessionCatalogPreview(row.kind) ?? null;
  }
  return { signedUrl, previewUrl };
}

/** Fallback builtins when RPC has no Toova rows yet (e.g. migration pending). */
function localBuiltinModels(category: string | null, query: string): GalleryModel[] {
  const q = query.trim().toLowerCase();
  return (Object.keys(FURNITURE) as Array<Exclude<FurnitureKind, 'imported'>>)
    .map((k) => {
      const def = FURNITURE[k];
      const cats = BUILTIN_CATEGORIES[k] ?? ['other'];
      return {
        kind: k,
        label: def.label,
        description: null,
        tags: [],
        categories: cats,
        width_in: def.size[0],
        height_in: def.size[1],
        depth_in: def.size[2],
        clearance_in: def.clearance ?? null,
        userId: null,
        visibility: 'public' as const,
        isBuiltin: true,
        likesCount: 0,
        downloadsCount: 0,
        viewsCount: 0,
        createdAt: '',
        creatorHandle: null,
        creatorDisplayName: null,
        likedByMe: false,
        hotScore: 0,
        storagePath: '',
        signedUrl: null,
        previewUrl: null,
      } satisfies GalleryModel;
    })
    .filter((m) => {
      if (category && !m.categories.includes(category as CatalogCategorySlug)) return false;
      if (!q) return true;
      return (
        m.label.toLowerCase().includes(q) ||
        m.kind.toLowerCase().includes(q) ||
        m.categories.some((c) => c.includes(q))
      );
    });
}

export function useGalleryCatalog(params: UseGalleryCatalogParams) {
  const {
    enabled,
    source,
    sort = 'hot',
    category = null,
    query = '',
    pageSize = 48,
  } = params;

  const [models, setModels] = useState<GalleryModel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);

  const patchPreview = useCallback((kind: string, previewUrl: string) => {
    setModels((prev) =>
      prev.map((entry) =>
        entry.kind === kind ? { ...entry, previewUrl } : entry,
      ),
    );
  }, []);

  const patchModel = useCallback((kind: string, patch: Partial<GalleryModel>) => {
    setModels((prev) =>
      prev.map((entry) => (entry.kind === kind ? { ...entry, ...patch } : entry)),
    );
  }, []);

  const removeModel = useCallback((kind: string) => {
    setModels((prev) => prev.filter((entry) => entry.kind !== kind));
    setTotal((t) => Math.max(0, t - 1));
  }, []);

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!enabled) {
        setModels([]);
        setTotal(0);
        return;
      }

      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const { data: authData } = await supabase.auth.getUser();
        currentUserIdRef.current = authData.user?.id ?? null;

        let rows: GalleryCatalogRow[] = [];
        let totalCount = 0;

        try {
          const result = await fetchGalleryCatalog({
            source,
            sort: source === 'mine' ? 'newest' : sort,
            category,
            query,
            limit: pageSize,
            offset,
          });
          rows = result.rows;
          totalCount = result.total;
        } catch (rpcErr) {
          // Fallback for Toova when RPC missing / migration not applied.
          if (source === 'toova') {
            const local = localBuiltinModels(category, query);
            rows = local.map((m) => ({
              kind: m.kind,
              label: m.label,
              description: m.description,
              tags: m.tags,
              categories: m.categories,
              width_in: m.width_in,
              height_in: m.height_in,
              depth_in: m.depth_in,
              clearance_in: m.clearance_in,
              model_url: null,
              thumbnail_path: null,
              user_id: null,
              visibility: m.visibility,
              is_builtin: true,
              likes_count: 0,
              downloads_count: 0,
              views_count: 0,
              created_at: '',
              creator_handle: null,
              creator_display_name: null,
              liked_by_me: false,
              hot_score: 0,
              total_count: local.length,
            }));
            totalCount = local.length;
          } else {
            throw rpcErr;
          }
        }

        if (source === 'toova' && rows.length === 0 && offset === 0) {
          const local = localBuiltinModels(category, query);
          const mapped = local.map((m) => m);
          setModels(mapped);
          setTotal(mapped.length);
          offsetRef.current = mapped.length;
          return;
        }

        const resolved = await Promise.all(
          rows.map(async (row) => {
            const urls = await resolveUrls(row);
            return rowToModel(row, urls.signedUrl, urls.previewUrl);
          }),
        );

        const out = resolved.filter((m) => m.isBuiltin || !!m.signedUrl);

        setTotal(totalCount);
        setModels((prev) => (append ? [...prev, ...out] : out));
        offsetRef.current = offset + rows.length;

        const backfillJobs = out
          .filter((e) => !e.isBuiltin && !e.previewUrl && e.signedUrl)
          .map((e) => ({
            kind: e.kind,
            signedUrl: e.signedUrl!,
            ownerUserId: e.userId,
          }));

        if (backfillJobs.length > 0) {
          enqueueCatalogThumbnailBackfill(
            backfillJobs,
            currentUserIdRef.current,
            patchPreview,
          );
        }
      } catch (e) {
        const raw = e instanceof Error ? e.message : 'Failed to load gallery';
        const msg =
          /could not find the function|schema cache/i.test(raw)
            ? 'Gallery is updating — try refreshing in a moment.'
            : raw;
        setError(msg);
        if (!append) {
          setModels([]);
          setTotal(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [enabled, source, sort, category, query, pageSize, patchPreview],
  );

  const refresh = useCallback(async () => {
    offsetRef.current = 0;
    await loadPage(0, false);
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore) return;
    if (models.length >= total && total > 0) return;
    await loadPage(offsetRef.current, true);
  }, [loadPage, loading, loadingMore, models.length, total]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    models,
    total,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
    hasMore: models.length < total,
    patchModel,
    removeModel,
  };
}
