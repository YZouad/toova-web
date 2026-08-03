import { imageToJpegThumbnail } from './thumbnailImage';
import { PROFILE_AVATARS_BUCKET, updateOwnProfile } from './profiles';
import { supabase } from './supabase';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function uploadProfileAvatar(file: File): Promise<{ path: string; signedUrl: string | null }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Image must be under 8MB.');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to upload an avatar.');

  const blob = await imageToJpegThumbnail(file, 512);
  if (!blob) throw new Error('Could not process image.');

  const objectPath = `${user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(PROFILE_AVATARS_BUCKET).upload(objectPath, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(error.message);

  await updateOwnProfile({ avatarPath: objectPath });

  const { data: signed } = await supabase.storage
    .from(PROFILE_AVATARS_BUCKET)
    .createSignedUrl(objectPath, 60 * 60);

  return { path: objectPath, signedUrl: signed?.signedUrl ?? null };
}

export async function clearProfileAvatar(previousPath?: string | null): Promise<void> {
  await updateOwnProfile({ avatarPath: null });
  const trimmed = previousPath?.trim();
  if (!trimmed) return;
  await supabase.storage.from(PROFILE_AVATARS_BUCKET).remove([trimmed]);
}
