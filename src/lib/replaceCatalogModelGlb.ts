import { buildAndUploadCatalogThumbnail } from './buildCatalogThumbnail';
import { MODEL_FILES_BUCKET } from './modelStorage';
import { mirrorToPublicModels } from './publicModelsMirror';
import { supabase } from './supabase';

export interface ReplaceCatalogModelGlbInput {
  userId: string;
  kind: string;
  glbFile: File;
  widthIn: number;
  heightIn: number;
  depthIn: number;
  visibility?: 'public' | 'private' | 'unlisted';
}

export interface ReplaceCatalogModelGlbResult {
  objectPath: string;
  thumbnailPath: string | null;
  updatedRoomItems: number;
}

export async function replaceCatalogModelGlb(
  input: ReplaceCatalogModelGlbInput,
): Promise<ReplaceCatalogModelGlbResult> {
  const ext = input.glbFile.name.toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb';
  const objectPath = `${input.userId}/${crypto.randomUUID()}.${ext}`;
  const contentType = ext === 'glb' ? 'model/gltf-binary' : 'model/gltf+json';

  const { error: upErr } = await supabase.storage
    .from(MODEL_FILES_BUCKET)
    .upload(objectPath, input.glbFile, {
      contentType: input.glbFile.type || contentType,
      cacheControl: '86400',
      upsert: false,
    });
  if (upErr) throw new Error(upErr.message);

  let thumbnailPath: string | null = null;
  try {
    thumbnailPath = await buildAndUploadCatalogThumbnail(input.userId, {
      glbFile: input.glbFile,
      preferFlatImage: null,
    });
  } catch {
    /* thumbnail is best-effort */
  }

  const { data, error } = await supabase.rpc('replace_catalog_model_glb', {
    p_kind: input.kind,
    p_model_url: objectPath,
    p_thumbnail_path: thumbnailPath,
    p_width_in: input.widthIn,
    p_height_in: input.heightIn,
    p_depth_in: input.depthIn,
  });
  if (error) throw new Error(error.message);

  const row = data as {
    updated_room_items?: number;
  } | null;

  if (input.visibility === 'public') {
    await mirrorToPublicModels([objectPath, thumbnailPath]);
  }

  return {
    objectPath,
    thumbnailPath,
    updatedRoomItems: Number(row?.updated_room_items ?? 0) || 0,
  };
}
