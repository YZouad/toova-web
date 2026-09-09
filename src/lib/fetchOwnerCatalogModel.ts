import type { GalleryModel } from '../hooks/useGalleryCatalog';
import { getSessionCatalogPreview } from './catalogThumbnailBackfill';
import type { CatalogCategorySlug } from './catalogCategories';
import { resolveBrowsableModelUrl } from './modelStorage';
import { supabase } from './supabase';

export async function fetchOwnerCatalogGalleryModel(kind: string): Promise<GalleryModel | null> {
  const { data, error } = await supabase
    .from('furniture_catalog')
    .select(
      'kind,label,description,tags,categories,width_in,height_in,depth_in,clearance_in,model_url,thumbnail_path,user_id,visibility,is_builtin,likes_count,downloads_count,views_count,created_at',
    )
    .eq('kind', kind)
    .eq('is_builtin', false)
    .maybeSingle();

  if (error || !data?.model_url) return null;

  const path = String(data.model_url).trim();
  const visibilityRaw = String(data.visibility ?? 'private');
  const visibility =
    visibilityRaw === 'public' || visibilityRaw === 'unlisted' ? visibilityRaw : 'private';
  const access = visibility === 'public' ? 'public' : 'private';
  const signedUrl = await resolveBrowsableModelUrl(path, { access });
  if (!signedUrl) return null;

  const thumbPath = (data.thumbnail_path as string | null)?.trim() ?? '';
  let previewUrl: string | null = null;
  if (thumbPath) {
    previewUrl = await resolveBrowsableModelUrl(thumbPath, { access });
  }
  previewUrl ??= getSessionCatalogPreview(kind) ?? null;

  return {
    kind: String(data.kind),
    label: String(data.label ?? ''),
    description: (data.description as string | null) ?? null,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    categories: Array.isArray(data.categories) ? (data.categories as CatalogCategorySlug[]) : [],
    width_in: Number(data.width_in),
    height_in: Number(data.height_in),
    depth_in: Number(data.depth_in),
    clearance_in: data.clearance_in != null ? Number(data.clearance_in) : null,
    userId: (data.user_id as string | null) ?? null,
    visibility,
    isBuiltin: false,
    likesCount: Number(data.likes_count ?? 0),
    downloadsCount: Number(data.downloads_count ?? 0),
    viewsCount: Number(data.views_count ?? 0),
    createdAt: String(data.created_at ?? new Date().toISOString()),
    creatorHandle: null,
    creatorDisplayName: null,
    likedByMe: false,
    hotScore: 0,
    storagePath: path,
    signedUrl,
    previewUrl,
  };
}
