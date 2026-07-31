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
