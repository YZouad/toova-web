import { useCallback, useEffect, useRef, useState } from 'react';
import {
  catalogThumbNeedsGlbHeal,
  catalogThumbNeedsUprightHeal,
  enqueueCatalogThumbnailBackfill,
  getSessionCatalogPreview,
  isChecklistPhotoThumbPath,
  type BackfillJobInput,
} from '../lib/catalogThumbnailBackfill';
import {
  fetchGalleryCatalog,
  type GalleryCatalogRow,
  type GallerySort,
  type GallerySource,
} from '../lib/galleryCatalog';
import { getBuiltinPreviewUrl } from './useBuiltinPreviews';
import { resolveBrowsableModelUrl, resolveCatalogThumbnailUrl } from '../lib/modelStorage';
import type { CatalogVisibility } from '../lib/catalogEngagement';
import type { CatalogCategorySlug } from '../lib/catalogCategories';
import { BUILTIN_CATEGORIES } from '../lib/catalogCategories';
import { FURNITURE, type FurnitureKind } from '../furniture/registry';
import { shouldStandImportedUpright } from '../lib/importedUpright';
import { isProceduralBuiltinKind } from '../lib/placeGalleryModel';
import { supabase } from '../lib/supabase';
import { trackCatalogSearched } from '../lib/analytics';

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
  /** Raw catalog thumbnail_path (for heal detection). */
  thumbnailPath?: string | null;
}

export interface UseGalleryCatalogParams {
  enabled: boolean;
  source: GallerySource;
  sort?: GallerySort;
  categories?: string[];
  query?: string;
  pageSize?: number;
  /** Persist Toova photo-thumb heals via admin RPC. */
  isAdmin?: boolean;
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
    thumbnailPath: row.thumbnail_path?.trim() || null,
  };
}

async function resolveUrls(row: GalleryCatalogRow): Promise<{
  signedUrl: string | null;
  previewUrl: string | null;
}> {
  const path = row.model_url?.trim() ?? '';
  const thumbPath = row.thumbnail_path?.trim() ?? '';
  const access = row.visibility === 'public' ? 'public' : 'private';

  let signedUrl: string | null = null;
  if (path) {
    const isAbsolute = path.startsWith('http://') || path.startsWith('https://');
    signedUrl = isAbsolute ? path : await resolveBrowsableModelUrl(path, { access });
  }

  let previewUrl: string | null = null;
  if (thumbPath) {
    previewUrl = await resolveCatalogThumbnailUrl(thumbPath, { access });
  }
  if (!previewUrl) {
    previewUrl = getSessionCatalogPreview(row.kind) ?? null;
  }
  if (!previewUrl && row.is_builtin) {
    previewUrl = getBuiltinPreviewUrl(row.kind) ?? null;
  }

  if (row.is_builtin && !signedUrl) {
    return { signedUrl: null, previewUrl };
  }
  if (!row.is_builtin && !signedUrl) {
    return { signedUrl: null, previewUrl: null };
  }
  return { signedUrl, previewUrl };
}

/** Fallback builtins when RPC has no Toova rows yet (e.g. migration pending). */
function localBuiltinModels(categories: string[], query: string): GalleryModel[] {
  const q = query.trim().toLowerCase();
  const required = categories.map((c) => c.toLowerCase());
  return (Object.keys(FURNITURE) as Array<Exclude<FurnitureKind, 'imported' | 'hanging' | 'light'>>)
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
      if (required.length > 0 && !required.every((c) => m.categories.includes(c as CatalogCategorySlug))) {
        return false;
      }
      if (!q) return true;
      return (
        m.label.toLowerCase().includes(q) ||
        m.kind.toLowerCase().includes(q) ||
        m.categories.some((c) => c.includes(q))
      );
    });
}

const EMPTY_CATEGORIES: string[] = [];

export function useGalleryCatalog(params: UseGalleryCatalogParams) {
  const {
    enabled,
    source,
    sort = 'hot',
    categories = EMPTY_CATEGORIES,
    query = '',
    pageSize = 48,
    isAdmin = false,
  } = params;

  const [models, setModels] = useState<GalleryModel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);
  // Debounces the catalog_searched analytics event only — query isn't debounced
  // upstream (GalleryPage.tsx updates it on every keystroke), so without this the
  // event would fire once per character typed instead of once per search.
  const searchTrackTimerRef = useRef<number | null>(null);

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
            sort,
            categories,
            query,
            limit: pageSize,
            offset,
          });
          rows = result.rows;
          totalCount = result.total;
        } catch (rpcErr) {
          // Fallback for Toova when RPC missing / migration not applied.
          if (source === 'toova') {
            const local = localBuiltinModels(categories, query);
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
          const local = localBuiltinModels(categories, query);
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

        if (!append) {
          const q = query.trim();
          if (searchTrackTimerRef.current) window.clearTimeout(searchTrackTimerRef.current);
          if (q) {
            searchTrackTimerRef.current = window.setTimeout(() => {
              trackCatalogSearched({ query: q, results_count: totalCount, context: 'gallery' });
            }, 500);
          }
        }

        const backfillJobs: BackfillJobInput[] = [];
        const queued = new Set<string>();
        const enqueue = (job: BackfillJobInput) => {
          if (queued.has(job.kind)) return;
          queued.add(job.kind);
          backfillJobs.push(job);
        };

        for (const e of out) {
          if (!e.signedUrl || e.tags.includes('poster')) continue;

          // Missing preview — session GLB snapshot for any non-procedural model.
          if (!e.previewUrl && !isProceduralBuiltinKind(e.kind)) {
            enqueue({
              kind: e.kind,
              signedUrl: e.signedUrl,
              ownerUserId: e.userId,
              label: e.label,
              replace: false,
              persistAsAdmin: isAdmin && e.isBuiltin,
            });
            continue;
          }

          // Owner "mine" heal: Trellis imports used to store the source photo.
          if (
            source === 'mine' &&
            !e.isBuiltin &&
            e.previewUrl &&
            catalogThumbNeedsGlbHeal(e.kind)
          ) {
            enqueue({
              kind: e.kind,
              signedUrl: e.signedUrl,
              ownerUserId: e.userId,
              label: e.label,
              replace: true,
            });
          }

          // Toova bank: replace staged shop photos (checklist-refs/images/…) with a GLB render.
          if (
            source === 'toova' &&
            e.isBuiltin &&
            !isProceduralBuiltinKind(e.kind) &&
            isChecklistPhotoThumbPath(e.thumbnailPath) &&
            catalogThumbNeedsGlbHeal(e.kind)
          ) {
            enqueue({
              kind: e.kind,
              signedUrl: e.signedUrl,
              ownerUserId: e.userId,
              label: e.label,
              replace: true,
              persistAsAdmin: isAdmin,
            });
          }

          // Upright heal: monitors/TVs/lamps/clocks that were rendered lying flat.
          if (
            !isProceduralBuiltinKind(e.kind) &&
            shouldStandImportedUpright(e.label) &&
            catalogThumbNeedsUprightHeal(e.kind)
          ) {
            enqueue({
              kind: e.kind,
              signedUrl: e.signedUrl,
              ownerUserId: e.userId,
              label: e.label,
              replace: true,
              persistAsAdmin: isAdmin && e.isBuiltin,
            });
          }
        }

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
    [enabled, source, sort, categories, query, pageSize, isAdmin, patchPreview],
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
