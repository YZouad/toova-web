import { supabase } from './supabase';

export const ROOM_THUMBNAILS_BUCKET = 'room-thumbnails';

/** Signed URL for a private room thumbnail object path. */
export async function signRoomThumbnailPath(
  objectPath: string,
  expiresSec = 60 * 60,
): Promise<string | null> {
  const trimmed = objectPath.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.storage
    .from(ROOM_THUMBNAILS_BUCKET)
    .createSignedUrl(trimmed, expiresSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Upload a JPEG room thumbnail, set rooms.thumbnail_path, delete the previous object.
 * Path layout: `{userId}/{roomId}/{uuid}.jpg`
 */
export async function uploadRoomThumbnail(
  blob: Blob,
  userId: string,
  roomId: string,
): Promise<string | null> {
  const objectPath = `${userId}/${roomId}/${crypto.randomUUID()}.jpg`;

  const { data: existing, error: readErr } = await supabase
    .from('rooms')
    .select('thumbnail_path')
    .eq('id', roomId)
    .maybeSingle();

  if (readErr) return null;
  const previous = (existing?.thumbnail_path as string | null)?.trim() || null;

  const { error: upErr } = await supabase.storage
    .from(ROOM_THUMBNAILS_BUCKET)
    .upload(objectPath, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    });
  if (upErr) return null;

  const { error: dbErr } = await supabase
    .from('rooms')
    .update({ thumbnail_path: objectPath })
    .eq('id', roomId);

  if (dbErr) {
    await supabase.storage.from(ROOM_THUMBNAILS_BUCKET).remove([objectPath]);
    return null;
  }

  if (previous && previous !== objectPath) {
    await supabase.storage.from(ROOM_THUMBNAILS_BUCKET).remove([previous]);
  }

  return objectPath;
}
