import { publicModelsUrl } from './modelStorage';
import {
  mirrorRoomThumbnailsToPublic,
  unmirrorFromPublicModels,
} from './publicModelsMirror';
import { signStoragePath } from './signedUrlCache';
import { supabase } from './supabase';

export const ROOM_THUMBNAILS_BUCKET = 'room-thumbnails';

/** Signed URL for a private room thumbnail, or public CDN URL for public rooms. */
export async function signRoomThumbnailPath(
  objectPath: string,
  expiresSec = 60 * 60,
): Promise<string | null> {
  return signStoragePath(ROOM_THUMBNAILS_BUCKET, objectPath, expiresSec);
}

export function resolveRoomThumbnailUrl(
  objectPath: string,
  isPublic: boolean,
): Promise<string | null> {
  const trimmed = objectPath.trim();
  if (!trimmed) return Promise.resolve(null);
  if (isPublic) return Promise.resolve(publicModelsUrl(trimmed));
  return signRoomThumbnailPath(trimmed);
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
    .select('thumbnail_path, visibility')
    .eq('id', roomId)
    .maybeSingle();

  if (readErr) return null;
  const previous = (existing?.thumbnail_path as string | null)?.trim() || null;

  const { error: upErr } = await supabase.storage
    .from(ROOM_THUMBNAILS_BUCKET)
    .upload(objectPath, blob, {
      contentType: 'image/jpeg',
      cacheControl: '86400',
      upsert: false,
    });
  if (upErr) return null;

  const { data: roomRow, error: dbErr } = await supabase
    .from('rooms')
    .update({ thumbnail_path: objectPath })
    .eq('id', roomId)
    .select('visibility')
    .maybeSingle();

  if (dbErr) {
    await supabase.storage.from(ROOM_THUMBNAILS_BUCKET).remove([objectPath]);
    return null;
  }

  if (previous && previous !== objectPath) {
    await supabase.storage.from(ROOM_THUMBNAILS_BUCKET).remove([previous]);
    await unmirrorFromPublicModels([previous]);
  }

  if (roomRow?.visibility === 'public' || existing?.visibility === 'public') {
    await mirrorRoomThumbnailsToPublic([objectPath]);
  }

  return objectPath;
}
