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
