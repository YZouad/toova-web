import { supabase } from './supabase';
import type { CatalogVisibility } from './catalogEngagement';
import { validateCatalogText } from './bannedWords';
import type { CatalogCategorySlug } from './catalogCategories';
import type { GallerySort, GallerySource } from './galleryCatalogHelpers';

export type {
  GalleryBrowseMode,
  GalleryPageSearchState,
  GallerySort,
  GallerySource,
  RoomGallerySortParam,
} from './galleryCatalogHelpers';
export {
  buildGallerySearchParams,
  catalogHotScore,
  parseGallerySearchParams,
} from './galleryCatalogHelpers';

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
  const sort = params.sort ?? (params.source === 'mine' ? 'newest' : 'hot');

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
