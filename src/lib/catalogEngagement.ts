import { supabase } from './supabase';
import { mirrorCatalogKind } from './publicModelsMirror';

export type CatalogVisibility = 'private' | 'unlisted' | 'public';

const VIEWED_SESSION_KEY = 'toova-catalog-viewed';

function readViewedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(VIEWED_SESSION_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function writeViewedSet(set: Set<string>): void {
  try {
    sessionStorage.setItem(VIEWED_SESSION_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore quota */
  }
}

export async function setCatalogVisibility(
  kind: string,
  visibility: CatalogVisibility,
): Promise<void> {
  const { error } = await supabase.rpc('set_catalog_visibility', {
    p_kind: kind,
    p_visibility: visibility,
  });
  if (error) throw new Error(error.message);
  await mirrorCatalogKind(kind);
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

export type CatalogReportReason =
  | 'inappropriate'
  | 'spam'
  | 'stolen'
  | 'other';

const REPORTED_SESSION_KEY = 'toova-catalog-reported';

export function hasReportedCatalogKind(kind: string): boolean {
  try {
    const raw = sessionStorage.getItem(REPORTED_SESSION_KEY);
    if (!raw) return false;
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) && arr.map(String).includes(kind);
  } catch {
    return false;
  }
}

function markReportedCatalogKind(kind: string): void {
  try {
    const raw = sessionStorage.getItem(REPORTED_SESSION_KEY);
    const prev = raw ? (JSON.parse(raw) as unknown) : [];
    const set = new Set(Array.isArray(prev) ? prev.map(String) : []);
    set.add(kind);
    sessionStorage.setItem(REPORTED_SESSION_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore quota */
  }
}

export async function reportCatalogModel(
  kind: string,
  reason: CatalogReportReason,
  details?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('report_catalog_model', {
    p_kind: kind,
    p_reason: reason,
    p_details: details?.trim() || null,
  });
  if (error) throw new Error(error.message);
  markReportedCatalogKind(kind);
}

/** Records at most one view per kind per browser session. */
export async function recordCatalogView(kind: string): Promise<number | null> {
  const viewed = readViewedSet();
  if (viewed.has(kind)) return null;
  viewed.add(kind);
  writeViewedSet(viewed);

  const { data, error } = await supabase.rpc('record_catalog_view', {
    p_kind: kind,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/**
 * Whether placing this model should increment downloads_count.
 * Public community models count (including curated ones with no owner).
 * Own models and builtins do not.
 */
export function shouldRecordCatalogDownload(
  model: {
    visibility: CatalogVisibility | string;
    userId?: string | null;
    isBuiltin?: boolean;
  },
  currentUserId: string | null | undefined,
): boolean {
  if (model.isBuiltin) return false;
  if (model.visibility !== 'public') return false;
  if (model.userId && currentUserId && model.userId === currentUserId) return false;
  return true;
}

/** Call when placing a public community model into the current user's room. */
export async function recordCatalogDownload(kind: string): Promise<number> {
  const { data, error } = await supabase.rpc('record_catalog_download', {
    p_kind: kind,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
