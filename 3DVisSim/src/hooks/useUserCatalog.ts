import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { signModelObjectPath } from '../lib/modelStorage';

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
  return typeof v === 'number' ? v : Number(v);
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
      const out: UserCatalogEntry[] = [];

      for (const row of rows) {
        const path = (row.model_url as string | null)?.trim() ?? '';
        if (!path) continue;

        const isAbsolute =
          path.startsWith('http://') || path.startsWith('https://');
        const signedUrl = isAbsolute
          ? path
          : await signModelObjectPath(path);

        if (!signedUrl) continue;

        out.push({
          kind: row.kind as string,
          label: row.label as string,
          description: (row.description as string | null) ?? null,
          tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
          width_in: n(row.width_in),
          height_in: n(row.height_in),
          depth_in: n(row.depth_in),
          clearance_in:
            row.clearance_in != null && row.clearance_in !== ''
              ? n(row.clearance_in)
              : null,
          storagePath: isAbsolute ? '' : path,
          signedUrl,
        });
      }

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
