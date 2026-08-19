import { supabase } from './supabase';
import { signStoragePath } from './signedUrlCache';

export const MODEL_FILES_BUCKET = 'model-files';
/** Public CDN mirror of catalog + public-room assets. Private originals stay in model-files. */
export const PUBLIC_MODELS_BUCKET = 'public-models';
/** Cloudflare R2 custom domain for currently-public catalog/room objects. */
export const R2_PUBLIC_BASE_URL = 'https://assets.toova.net';

export type StorageUrlAccess = 'public' | 'private';

/** Stable public URL for a CDN object (R2, no signing). */
export function publicModelsUrl(objectPath: string): string | null {
  const trimmed = objectPath.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const encoded = trimmed.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return encoded ? `${R2_PUBLIC_BASE_URL}/${encoded}` : null;
}

/** Signed URL for private bucket objects (path = object key inside the bucket). */
export async function signModelObjectPath(
  objectPath: string,
  expiresSec = 60 * 60 * 24,
): Promise<string | null> {
  return signStoragePath(MODEL_FILES_BUCKET, objectPath, expiresSec);
}

/**
 * Sign a model path that is either owned by the caller or listed as a public
 * catalog / public-room asset (RLS). Returns null if the object is private to
 * someone else — use signShareAssetPaths for share-token access instead.
 */
export async function signBrowsableModelPath(
  objectPath: string,
  expiresSec = 60 * 60 * 24,
): Promise<string | null> {
  return signModelObjectPath(objectPath, expiresSec);
}

/** Same-origin URL for repo `public/` models (e.g. checklist-refs/glb/…). */
export function publicModelAssetUrl(objectPath: string): string | null {
  const trimmed = objectPath.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const viteBase = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  if (trimmed.startsWith('checklist-refs/') || trimmed.startsWith('marketing/')) {
    return `${viteBase}${trimmed}`;
  }
  if (trimmed.startsWith('/')) return `${viteBase}${trimmed.replace(/^\//, '')}`;
  return null;
}

/** Repo static URL, public CDN URL, or a signed private-bucket URL. */
export async function resolveBrowsableModelUrl(
  objectPath: string,
  expiresSecOrOpts: number | { expiresSec?: number; access?: StorageUrlAccess } = 60 * 60 * 24,
): Promise<string | null> {
  const opts =
    typeof expiresSecOrOpts === 'number'
      ? { expiresSec: expiresSecOrOpts, access: 'private' as const }
      : expiresSecOrOpts;
  const staticUrl = publicModelAssetUrl(objectPath);
  if (staticUrl) return staticUrl;
  if (opts.access === 'public') return publicModelsUrl(objectPath);
  return signBrowsableModelPath(objectPath, opts.expiresSec ?? 60 * 60 * 24);
}

/** Safe filename for a catalog GLB/GLTF download. */
export function catalogModelDownloadFilename(
  label: string,
  storagePath = '',
  signedUrl = '',
): string {
  const haystack = `${storagePath} ${signedUrl}`.toLowerCase();
  const ext = haystack.includes('.gltf') ? 'gltf' : 'glb';
  const base =
    label
      .trim()
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'model';
  return `${base}.${ext}`;
}

/**
 * Fetch a signed (or absolute) model URL and trigger a browser file download.
 * Uses a blob URL so the `download` attribute works across origins.
 */
export async function downloadModelFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Could not download model');
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

/** Look up a catalog row by kind and download its GLB/GLTF. */
export async function downloadCatalogModelByKind(
  kind: string,
  filenameLabel: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('furniture_catalog')
    .select('model_url,label,visibility')
    .eq('kind', kind)
    .maybeSingle();
  if (error || !data?.model_url) {
    throw new Error('Could not download model');
  }
  const path = String(data.model_url).trim();
  const url = await resolveBrowsableModelUrl(path, {
    access: data.visibility === 'public' ? 'public' : 'private',
  });
  if (!url) {
    throw new Error('Could not download model');
  }
  await downloadModelFile(
    url,
    catalogModelDownloadFilename(
      filenameLabel || String(data.label ?? ''),
      path,
      url,
    ),
  );
}

/** Upload a JPEG thumbnail under `{userId}/thumbnails/{uuid}.jpg`. */
export async function uploadModelThumbnail(
  blob: Blob,
  userId: string,
): Promise<string | null> {
  const objectPath = `${userId}/thumbnails/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(MODEL_FILES_BUCKET)
    .upload(objectPath, blob, {
      contentType: 'image/jpeg',
      cacheControl: '86400',
      upsert: false,
    });
  if (error) return null;
  return objectPath;
}
