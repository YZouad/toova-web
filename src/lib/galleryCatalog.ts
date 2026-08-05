import { supabase } from './supabase';
import type { CatalogVisibility } from './catalogEngagement';
import { validateCatalogText } from './bannedWords';
import type { CatalogCategorySlug } from './catalogCategories';

export type GallerySource = 'community' | 'toova' | 'mine';
export type GallerySort = 'hot' | 'downloads' | 'likes' | 'views' | 'newest';

export interface GalleryCatalogRow {
  kind: string;
  label: string;
  description: string | null;
  tags: string[];
  categories: CatalogCategorySlug[];
  width_in: number;
  height_in: number;
  depth_in: number;
  clearance_in: number | null;
  model_url: string | null;
  thumbnail_path: string | null;
  user_id: string | null;
  visibility: CatalogVisibility;
  is_builtin: boolean;
  likes_count: number;
  downloads_count: number;
  views_count: number;
  created_at: string;
  creator_handle: string | null;
  creator_display_name: string | null;
  liked_by_me: boolean;
  hot_score: number;
  total_count: number;
}

export interface FetchGalleryParams {
  source: GallerySource;
  sort?: GallerySort;
  category?: string | null;
  query?: string | null;
  limit?: number;
  offset?: number;
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function mapRow(row: Record<string, unknown>): GalleryCatalogRow {
  const visibilityRaw = String(row.visibility ?? 'private');
  const visibility: CatalogVisibility =
    visibilityRaw === 'public' || visibilityRaw === 'unlisted'
      ? visibilityRaw
      : 'private';

  return {
    kind: String(row.kind ?? ''),
    label: String(row.label ?? ''),
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
    model_url: (row.model_url as string | null) ?? null,
    thumbnail_path: (row.thumbnail_path as string | null) ?? null,
    user_id: (row.user_id as string | null) ?? null,
    visibility,
    is_builtin: Boolean(row.is_builtin),
    likes_count: n(row.likes_count),
    downloads_count: n(row.downloads_count),
    views_count: n(row.views_count),
    created_at: String(row.created_at ?? ''),
    creator_handle: (row.creator_handle as string | null) ?? null,
    creator_display_name: (row.creator_display_name as string | null) ?? null,
    liked_by_me: Boolean(row.liked_by_me),
    hot_score: n(row.hot_score),
    total_count: n(row.total_count),
  };
}

export async function fetchGalleryCatalog(
  params: FetchGalleryParams,
): Promise<{ rows: GalleryCatalogRow[]; total: number }> {
  const sort =
    params.source === 'mine' ? 'newest' : (params.sort ?? 'hot');

  const { data, error } = await supabase.rpc('get_gallery_catalog', {
    p_source: params.source,
    p_sort: sort,
    p_category: params.category ?? null,
    p_query: params.query ?? null,
    p_limit: params.limit ?? 48,
    p_offset: params.offset ?? 0,
  });

  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((r: Record<string, unknown>) => mapRow(r));
  const total = rows[0]?.total_count ?? 0;
  return { rows, total };
}

export async function updateCatalogModel(input: {
  kind: string;
  label?: string;
  description?: string | null;
}): Promise<void> {
  const ban = validateCatalogText({
    label: input.label,
    description: input.description,
  });
  if (ban) throw new Error(ban);

  const { error } = await supabase.rpc('update_catalog_model', {
    p_kind: input.kind,
    p_label: input.label ?? null,
    p_description: input.description ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCatalogModel(
  kind: string,
): Promise<{ model_url: string | null; thumbnail_path: string | null }> {
  const { data, error } = await supabase.rpc('delete_catalog_model', {
    p_kind: kind,
  });
  if (error) throw new Error(error.message);
  const row = data as {
    model_url?: string | null;
    thumbnail_path?: string | null;
  } | null;
  return {
    model_url: row?.model_url ?? null,
    thumbnail_path: row?.thumbnail_path ?? null,
  };
}

export function catalogHotScore(input: {
  likes: number;
  downloads: number;
  views: number;
  createdAt: Date | string;
  now?: Date;
}): number {
  const created =
    typeof input.createdAt === 'string'
      ? new Date(input.createdAt)
      : input.createdAt;
  const now = input.now ?? new Date();
  const ageDays =
    Math.max(0, (now.getTime() - created.getTime()) / 86400000) + 2;
  const raw =
    input.likes * 4 + input.downloads * 3 + input.views * 0.1;
  return raw / Math.pow(Math.max(1, ageDays), 1.2);
}

/** Standalone /gallery modes: Discover home vs dedicated browse views. */
export type GalleryBrowseMode = 'discover' | 'models' | 'rooms';
export type RoomGallerySortParam = 'hot' | 'likes' | 'views' | 'clones' | 'newest';

export interface GalleryPageSearchState {
  mode: GalleryBrowseMode;
  /** Model browse source (Community / Toova / Mine). */
  source: GallerySource;
  /** Model sort when mode=models. */
  sort: GallerySort;
  /** Room sort when mode=rooms. */
  roomSort: RoomGallerySortParam;
  category: string | null;
  query: string;
}

export function parseGallerySearchParams(
  search: string,
): GalleryPageSearchState {
  const sp = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  );
  const modeRaw = sp.get('mode');
  let mode: GalleryBrowseMode = 'discover';
  if (modeRaw === 'models' || modeRaw === 'rooms') {
    mode = modeRaw;
  } else if (
    sp.has('source') ||
    sp.has('category') ||
    sp.has('sort') ||
    (sp.get('q') ?? '').trim()
  ) {
    // Legacy / deep links without mode → models browse.
    mode = 'models';
  }

  const sourceRaw = sp.get('source') ?? 'community';
  const source: GallerySource =
    sourceRaw === 'toova' || sourceRaw === 'mine' || sourceRaw === 'community'
      ? sourceRaw
      : 'community';
  const sortRaw = sp.get('sort') ?? 'hot';
  const sort: GallerySort =
    sortRaw === 'downloads' ||
    sortRaw === 'likes' ||
    sortRaw === 'views' ||
    sortRaw === 'newest' ||
    sortRaw === 'hot'
      ? sortRaw
      : 'hot';
  const roomSortRaw = sp.get('roomSort') ?? (sortRaw === 'downloads' ? 'clones' : sortRaw);
  const roomSort: RoomGallerySortParam =
    roomSortRaw === 'likes' ||
    roomSortRaw === 'views' ||
    roomSortRaw === 'clones' ||
    roomSortRaw === 'newest' ||
    roomSortRaw === 'hot'
      ? roomSortRaw
      : 'hot';
  return {
    mode,
    source,
    sort: source === 'mine' ? 'newest' : sort,
    roomSort,
    category: sp.get('category'),
    query: sp.get('q') ?? '',
  };
}

export function buildGallerySearchParams(state: {
  mode?: GalleryBrowseMode;
  source?: GallerySource;
  sort?: GallerySort;
  roomSort?: RoomGallerySortParam;
  category?: string | null;
  query?: string;
}): string {
  const mode = state.mode ?? 'discover';
  const sp = new URLSearchParams();
  if (mode !== 'discover') sp.set('mode', mode);

  if (mode === 'models') {
    const source = state.source ?? 'community';
    const sort = state.sort ?? 'hot';
    if (source !== 'community') sp.set('source', source);
    if (source !== 'mine' && sort !== 'hot') sp.set('sort', sort);
    if (state.category) sp.set('category', state.category);
  } else if (mode === 'rooms') {
    const roomSort = state.roomSort ?? 'hot';
    if (roomSort !== 'hot') sp.set('roomSort', roomSort);
  }

  if (state.query?.trim()) sp.set('q', state.query.trim());
  const s = sp.toString();
  return s ? `?${s}` : '';
}
