import {
  MODEL_FILES_BUCKET,
  PUBLIC_MODELS_BUCKET,
} from './modelStorage';
import { ingestPublicR2, unmirrorPublicR2 } from './r2StorageWorker';
import { supabase } from './supabase';

const ROOM_THUMBNAILS_BUCKET = 'room-thumbnails';

function storageObjectPaths(paths: Array<string | null | undefined>): string[] {
  const unique = new Set<string>();
  for (const raw of paths) {
    const path = raw?.trim() ?? '';
    if (!path) continue;
    if (path.startsWith('http://') || path.startsWith('https://')) continue;
    if (path.startsWith('blob:')) continue;
    unique.add(path);
  }
  return [...unique];
}

function alreadyExists(message: string): boolean {
  return /already exists|duplicate|409/i.test(message);
}

/** Copy private-bucket objects into public-models so CDN URLs resolve. */
export async function mirrorToPublicModels(
  paths: Array<string | null | undefined>,
  sourceBucket: string = MODEL_FILES_BUCKET,
): Promise<void> {
  const unique = storageObjectPaths(paths);
  await Promise.all(
    unique.map(async (path) => {
      const { error } = await supabase.storage.from(sourceBucket).copy(path, path, {
        destinationBucket: PUBLIC_MODELS_BUCKET,
      });
      if (!error || alreadyExists(error.message)) return;
      console.warn('[public-models] mirror failed', path, error.message);
    }),
  );
  const r2Bucket =
    sourceBucket === ROOM_THUMBNAILS_BUCKET ? 'room-thumbnails' : 'model-files';
  await ingestPublicR2(unique.map((path) => ({ bucket: r2Bucket, path })));
}

export async function mirrorRoomThumbnailsToPublic(
  paths: Array<string | null | undefined>,
): Promise<void> {
  await mirrorToPublicModels(paths, ROOM_THUMBNAILS_BUCKET);
}

/**
 * Remove CDN copies that are no longer a public catalog, public room, or
 * public room-thumbnail asset. Leaves the private original in place.
 */
export async function unmirrorFromPublicModels(
  paths: Array<string | null | undefined>,
): Promise<void> {
  const unique = storageObjectPaths(paths);
  const stale: string[] = [];
  for (const path of unique) {
    const { data, error } = await supabase.rpc('is_cdn_public_asset', {
      p_object_path: path,
    });
    if (error) {
      console.warn('[public-models] is_cdn_public_asset failed', path, error.message);
      continue;
    }
    if (data === true) continue;
    stale.push(path);
  }
  if (stale.length === 0) return;
  const { error } = await supabase.storage.from(PUBLIC_MODELS_BUCKET).remove(stale);
  if (error) console.warn('[public-models] unmirror failed', error.message);
  await unmirrorPublicR2(stale);
}

export async function removePublicModelMirrors(
  paths: Array<string | null | undefined>,
): Promise<void> {
  const unique = storageObjectPaths(paths);
  if (unique.length === 0) return;
  await supabase.storage.from(PUBLIC_MODELS_BUCKET).remove(unique);
  await unmirrorPublicR2(unique);
}

export async function mirrorCatalogKind(kind: string): Promise<void> {
  const { data } = await supabase
    .from('furniture_catalog')
    .select('model_url, thumbnail_path, usdz_path, silhouette_path, visibility')
    .eq('kind', kind)
    .maybeSingle();
  if (!data) return;
  const paths = [
    data.model_url as string | null,
    data.thumbnail_path as string | null,
    data.usdz_path as string | null,
    data.silhouette_path as string | null,
  ];
  if (data.visibility === 'public') await mirrorToPublicModels(paths);
  else await unmirrorFromPublicModels(paths);
}

export async function mirrorRoomAssets(roomId: string, visibility: 'private' | 'public'): Promise<void> {
  const [{ data: room }, { data: items }] = await Promise.all([
    supabase.from('rooms').select('thumbnail_path').eq('id', roomId).maybeSingle(),
    supabase
      .from('room_items')
      .select('model_url, blanket_texture_path')
      .eq('room_id', roomId),
  ]);
  const modelPaths = (items ?? []).flatMap((row) => [
    row.model_url as string | null,
    row.blanket_texture_path as string | null,
  ]);
  const thumb = (room?.thumbnail_path as string | null) ?? null;
  if (visibility === 'public') {
    await Promise.all([
      mirrorToPublicModels(modelPaths),
      mirrorRoomThumbnailsToPublic([thumb]),
    ]);
    return;
  }
  await unmirrorFromPublicModels([...modelPaths, thumb]);
}
