import { FURNITURE } from '../furniture/registry';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import type { CatalogCategorySlug } from './catalogCategories';
import type { CatalogVisibility } from './catalogEngagement';
import type { InchSize } from './importedItemSize';
import { resolveBrowsableModelUrl, resolveCatalogThumbnailUrl } from './modelStorage';
import { supabase } from './supabase';

export function isProceduralBuiltinKind(kind: string): boolean {
  return kind in FURNITURE && kind !== 'imported' && kind !== 'hanging' && kind !== 'light';
}

export function galleryModelImportedSize(model: GalleryModel): InchSize {
  return [model.width_in, model.height_in, model.depth_in];
}

/** True when a Toova-bank / gallery card should place as an imported GLB. */
export function galleryModelPlacesAsImport(model: Pick<GalleryModel, 'kind' | 'signedUrl' | 'storagePath'>): boolean {
  if (isProceduralBuiltinKind(model.kind)) return false;
  return Boolean(model.signedUrl || model.storagePath);
}

/** Load a single catalog row by kind for deep links (?placeCatalog=). */
export async function fetchGalleryModelByKind(kind: string): Promise<GalleryModel | null> {
  const trimmed = kind.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase
    .from('furniture_catalog')
    .select(
      'kind,label,description,tags,categories,width_in,height_in,depth_in,clearance_in,model_url,thumbnail_path,user_id,visibility,is_builtin,likes_count,downloads_count,views_count,created_at',
    )
    .eq('kind', trimmed)
    .maybeSingle();

  if (error || !data) return null;

  const storagePath = typeof data.model_url === 'string' ? data.model_url.trim() : '';
  const visibilityRaw = String(data.visibility ?? 'private');
  const visibility: CatalogVisibility =
    visibilityRaw === 'public' || visibilityRaw === 'unlisted' ? visibilityRaw : 'private';
  const access = visibility === 'public' ? 'public' : 'private';

  const [signedUrl, previewUrl] = await Promise.all([
    storagePath ? resolveBrowsableModelUrl(storagePath, { access }) : Promise.resolve(null),
    data.thumbnail_path
      ? resolveCatalogThumbnailUrl(String(data.thumbnail_path), { access })
      : Promise.resolve(null),
  ]);

  return {
    kind: String(data.kind ?? ''),
    label: String(data.label ?? ''),
    description: (data.description as string | null) ?? null,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    categories: Array.isArray(data.categories) ? (data.categories as CatalogCategorySlug[]) : [],
    width_in: Number(data.width_in) || 0,
    height_in: Number(data.height_in) || 0,
    depth_in: Number(data.depth_in) || 0,
    clearance_in: data.clearance_in != null ? Number(data.clearance_in) : null,
    userId: (data.user_id as string | null) ?? null,
    visibility,
    isBuiltin: Boolean(data.is_builtin),
    likesCount: Number(data.likes_count) || 0,
    downloadsCount: Number(data.downloads_count) || 0,
    viewsCount: Number(data.views_count) || 0,
    createdAt: String(data.created_at ?? ''),
    creatorHandle: null,
    creatorDisplayName: null,
    likedByMe: false,
    hotScore: 0,
    storagePath,
    signedUrl,
    previewUrl,
  };
}

function consumeSearchParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const value = url.searchParams.get(name)?.trim() || null;
  if (!value) return null;
  url.searchParams.delete(name);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', next || '/');
  return value;
}

/** Read and strip ?placeCatalog=<kind> from the current location. */
export function consumePlaceCatalogParam(): string | null {
  return consumeSearchParam('placeCatalog');
}

/** Read and strip ?openRoom=<id> from the current location. */
export function consumeOpenRoomParam(): string | null {
  return consumeSearchParam('openRoom');
}

/** Read and strip ?template=<starterId> (dorm / room starter deep link). */
export function consumeTemplateParam(): string | null {
  return consumeSearchParam('template');
}

/** Load a room the current user can open (owner or editor). */
export async function fetchOpenableRoom(
  roomId: string,
): Promise<{ id: string; name: string; isOwner: boolean } | null> {
  const trimmed = roomId.trim();
  if (!trimmed) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('rooms')
    .select('id,name,user_id')
    .eq('id', trimmed)
    .maybeSingle();
  if (error || !data) return null;

  const isOwner = data.user_id === user.id;
  if (!isOwner) {
    const { data: collab } = await supabase
      .from('room_collaborators')
      .select('role')
      .eq('room_id', trimmed)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!collab || (collab.role !== 'editor' && collab.role !== 'viewer')) return null;
  }

  return {
    id: String(data.id),
    name: String(data.name || 'Room'),
    isOwner,
  };
}
