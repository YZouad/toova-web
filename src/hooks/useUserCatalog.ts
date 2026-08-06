import { useCallback, useEffect, useRef, useState } from 'react';
import {
  enqueueCatalogThumbnailBackfill,
  getSessionCatalogPreview,
} from '../lib/catalogThumbnailBackfill';
import { parseInchDims } from '../lib/importedItemSize';
import type { CatalogVisibility } from '../lib/catalogEngagement';
import { signBrowsableModelPath } from '../lib/modelStorage';
import { supabase } from '../lib/supabase';

export interface UserCatalogEntry {
  kind: string;
  label: string;
  description: string | null;
  tags: string[];
  width_in: number;
  height_in: number;
  depth_in: number;
  clearance_in: number | null;
  userId: string | null;
  visibility: CatalogVisibility;
  likesCount: number;
  downloadsCount: number;
  viewsCount: number;
  /** Object path in `model-files` bucket; empty if legacy full URL in DB. */
  storagePath: string;
  /** URL for useGLTF (signed or absolute). */
  signedUrl: string | null;
  /** Signed thumbnail path or session snapshot. */
  previewUrl: string | null;
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : NaN;
}

export function useUserCatalog(enabled: boolean) {
  const [catalog, setCatalog] = useState<UserCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  const patchPreview = useCallback((kind: string, previewUrl: string) => {
    setCatalog((prev) =>
      prev.map((entry) =>
        entry.kind === kind ? { ...entry, previewUrl } : entry,
      ),
    );
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCatalog([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      currentUserIdRef.current = authData.user?.id ?? null;

      const { data, error: qErr } = await supabase
        .from('furniture_catalog')
        .select(
          'kind,label,description,tags,width_in,height_in,depth_in,clearance_in,model_url,thumbnail_path,user_id,visibility,likes_count,downloads_count,views_count',
        )
        .eq('is_builtin', false)
        .order('label');

      if (qErr) throw new Error(qErr.message);

      const rows = data ?? [];
      const resolved = await Promise.all(
        rows.map(async (row): Promise<UserCatalogEntry | null> => {
          const path = (row.model_url as string | null)?.trim() ?? '';
          if (!path) return null;

          const isAbsolute =
            path.startsWith('http://') || path.startsWith('https://');
          const signedUrl = isAbsolute
            ? path
            : await signBrowsableModelPath(path);

          if (!signedUrl) return null;

          const dims = parseInchDims(row.width_in, row.height_in, row.depth_in);
          if (!dims) return null;

          const thumbPath = (row.thumbnail_path as string | null)?.trim() ?? '';
          let previewUrl: string | null = null;
          if (thumbPath) {
            previewUrl = await signBrowsableModelPath(thumbPath);
          } else {
            previewUrl = getSessionCatalogPreview(row.kind as string) ?? null;
          }

          const visibilityRaw = String(row.visibility ?? 'private');
          const visibility: CatalogVisibility =
            visibilityRaw === 'public' || visibilityRaw === 'unlisted'
              ? visibilityRaw
              : 'private';

          return {
            kind: row.kind as string,
            label: row.label as string,
            description: (row.description as string | null) ?? null,
            tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
            width_in: dims[0],
            height_in: dims[1],
            depth_in: dims[2],
            clearance_in:
              row.clearance_in != null && row.clearance_in !== ''
                ? n(row.clearance_in)
                : null,
            userId: (row.user_id as string | null) ?? null,
            visibility,
            likesCount: Number(row.likes_count ?? 0),
            downloadsCount: Number(row.downloads_count ?? 0),
            viewsCount: Number(row.views_count ?? 0),
            storagePath: isAbsolute ? '' : path,
            signedUrl,
            previewUrl,
          };
        }),
      );

      const out = resolved.filter(
        (entry): entry is UserCatalogEntry => entry !== null,
      );

      setCatalog(out);

      const backfillJobs = out
        .filter((e) => !e.previewUrl && e.signedUrl)
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
      const msg = e instanceof Error ? e.message : 'Failed to load models';
      setError(msg);
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, patchPreview]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { catalog, loading, error, refresh };
}
