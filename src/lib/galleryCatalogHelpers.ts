export type GallerySource = 'community' | 'toova' | 'mine';
export type GallerySort = 'hot' | 'downloads' | 'likes' | 'views' | 'newest';

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
  /** Selected category slugs (AND match). Empty = all. */
  categories: string[];
  query: string;
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

/** Parse `category=seating` or `category=seating,outdoor` into slug list. */
export function parseCategoryParam(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const slug = part.trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export function formatCategoryParam(categories: string[] | null | undefined): string | null {
  if (!categories?.length) return null;
  return categories.join(',');
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
    sort: source === 'mine' && sort === 'hot' ? 'newest' : sort,
    roomSort,
    categories: parseCategoryParam(sp.get('category')),
    query: sp.get('q') ?? '',
  };
}

export function buildGallerySearchParams(state: {
  mode?: GalleryBrowseMode;
  source?: GallerySource;
  sort?: GallerySort;
  roomSort?: RoomGallerySortParam;
  categories?: string[] | null;
  /** @deprecated Prefer `categories`. Single slug still accepted. */
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
    const cats =
      state.categories ??
      (state.category ? parseCategoryParam(state.category) : []);
    const catParam = formatCategoryParam(cats);
    if (catParam) sp.set('category', catParam);
  } else if (mode === 'rooms') {
    const roomSort = state.roomSort ?? 'hot';
    if (roomSort !== 'hot') sp.set('roomSort', roomSort);
  }

  if (state.query?.trim()) sp.set('q', state.query.trim());
  const s = sp.toString();
  return s ? `?${s}` : '';
}
