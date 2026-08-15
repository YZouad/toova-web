import { supabase } from './supabase';

export const MODEL_FILES_BUCKET = 'model-files';

/** Signed URL for private bucket objects (path = object key inside the bucket). */
export async function signModelObjectPath(
  objectPath: string,
  expiresSec = 60 * 60 * 24,
): Promise<string | null> {
  const trimmed = objectPath.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.storage
    .from(MODEL_FILES_BUCKET)
    .createSignedUrl(trimmed, expiresSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
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
    .select('model_url,label')
    .eq('kind', kind)
    .maybeSingle();
  if (error || !data?.model_url) {
    throw new Error('Could not download model');
  }
  const path = String(data.model_url).trim();
  const isAbsolute = path.startsWith('http://') || path.startsWith('https://');
  const url = isAbsolute ? path : await signBrowsableModelPath(path);
  if (!url) {
    throw new Error('Could not download model');
  }
  await downloadModelFile(
    url,
    catalogModelDownloadFilename(
      filenameLabel || String(data.label ?? ''),
      isAbsolute ? '' : path,
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
      upsert: false,
    });
  if (error) return null;
  return objectPath;
}
