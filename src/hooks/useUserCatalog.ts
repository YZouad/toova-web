import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { signModelObjectPath } from '../lib/modelStorage';
import { parseInchDims } from '../lib/importedItemSize';

export interface UserCatalogEntry {
  kind: string;
  label: string;
  description: string | null;
  tags: string[];
  width_in: number;
  height_in: number;
  depth_in: number;
  clearance_in: number | null;
  /** Object path in `model-files` bucket; empty if legacy full URL in DB. */
  storagePath: string;
  /** URL for useGLTF (signed or absolute). */
  signedUrl: string | null;
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : NaN;
}

export function useUserCatalog(enabled: boolean) {
  const [catalog, setCatalog] = useState<UserCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCatalog([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from('furniture_catalog')
        .select(
          'kind,label,description,tags,width_in,height_in,depth_in,clearance_in,model_url',
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
            : await signModelObjectPath(path);

          if (!signedUrl) return null;

          const dims = parseInchDims(row.width_in, row.height_in, row.depth_in);
          if (!dims) return null;

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
            storagePath: isAbsolute ? '' : path,
            signedUrl,
          };
        }),
      );

      const out = resolved.filter(
        (entry): entry is UserCatalogEntry => entry !== null,
      );

      setCatalog(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load models';
      setError(msg);
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { catalog, loading, error, refresh };
}
