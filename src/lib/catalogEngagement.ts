import { supabase } from './supabase';

export type CatalogVisibility = 'private' | 'unlisted' | 'public';

export async function setCatalogVisibility(
  kind: string,
  visibility: CatalogVisibility,
): Promise<void> {
  const { error } = await supabase.rpc('set_catalog_visibility', {
    p_kind: kind,
    p_visibility: visibility,
  });
  if (error) throw new Error(error.message);
}

export async function toggleCatalogLike(
  kind: string,
): Promise<{ liked: boolean; likes_count: number }> {
  const { data, error } = await supabase.rpc('toggle_catalog_like', {
    p_kind: kind,
  });
  if (error) throw new Error(error.message);
  const row = data as { liked?: boolean; likes_count?: number } | null;
  return {
    liked: Boolean(row?.liked),
    likes_count: Number(row?.likes_count ?? 0),
  };
}

export async function recordCatalogView(kind: string): Promise<number> {
  const { data, error } = await supabase.rpc('record_catalog_view', {
    p_kind: kind,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Call when placing a public community model into the current user's room. */
export async function recordCatalogDownload(kind: string): Promise<number> {
  const { data, error } = await supabase.rpc('record_catalog_download', {
    p_kind: kind,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
