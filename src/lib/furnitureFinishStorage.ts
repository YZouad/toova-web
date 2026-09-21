import { resizeImageFileToJpegBlob } from './beddingStorage';
import { MODEL_FILES_BUCKET, signModelObjectPath } from './modelStorage';
import { supabase } from './supabase';

export async function uploadFurnitureFinishTexture(
  file: File,
): Promise<{ path: string; signedUrl: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to upload a furniture texture');
  const blob = await resizeImageFileToJpegBlob(file);
  const objectPath = `${user.id}/finishes/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(MODEL_FILES_BUCKET).upload(objectPath, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const signed = await signModelObjectPath(objectPath);
  if (!signed) throw new Error('Could not sign texture URL');
  return { path: objectPath, signedUrl: signed };
}

export async function removeFurnitureFinishTexture(path: string): Promise<void> {
  const trimmed = path.trim();
  if (!trimmed) return;
  const { error } = await supabase.storage.from(MODEL_FILES_BUCKET).remove([trimmed]);
  if (error) throw new Error(error.message);
}
