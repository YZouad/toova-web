import { buildAndUploadCatalogThumbnail } from './buildCatalogThumbnail';
import type { CatalogCategorySlug } from './catalogCategories';
import type { ConversionJobSource } from './conversionJobs';
import { MODEL_FILES_BUCKET } from './modelStorage';
import { supabase } from './supabase';

export interface UploadCatalogModelInput {
  userId: string;
  glbFile: File;
  label: string;
  widthIn: number;
  heightIn: number;
  depthIn: number;
  clearanceIn?: number | null;
  description?: string | null;
  visibility?: 'public' | 'private';
  categories?: CatalogCategorySlug[];
  tags?: string[];
  preferFlatImage?: Blob | null;
  /** Original file name before decimation, for source detection. */
  originalFileName?: string;
}

export interface UploadCatalogModelResult {
  kind: string;
  objectPath: string;
}

export function detectCatalogModelSource(
  originalFileName: string,
  tags: string[] = [],
): ConversionJobSource {
  if (tags.includes('poster')) return 'poster';
  if (originalFileName.toLowerCase() === 'generated.glb') return 'trellis';
  return 'upload';
}

export async function uploadCatalogModel(
  input: UploadCatalogModelInput,
): Promise<UploadCatalogModelResult> {
  const ext = input.glbFile.name.toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb';
  const objectPath = `${input.userId}/${crypto.randomUUID()}.${ext}`;
  const kind = `custom-${crypto.randomUUID()}`;
  const contentType = ext === 'glb' ? 'model/gltf-binary' : 'model/gltf+json';
  const tags = input.tags ?? [];
  const source = detectCatalogModelSource(input.originalFileName ?? input.glbFile.name, tags);

  const { error: upErr } = await supabase.storage
    .from(MODEL_FILES_BUCKET)
    .upload(objectPath, input.glbFile, {
      contentType: input.glbFile.type || contentType,
      upsert: false,
    });
  if (upErr) throw new Error(upErr.message);

  let thumbnailPath: string | null = null;
  try {
    thumbnailPath = await buildAndUploadCatalogThumbnail(input.userId, {
      glbFile: input.glbFile,
      preferFlatImage: source === 'poster' ? input.preferFlatImage ?? null : null,
    });
  } catch {
    /* thumbnail is best-effort */
  }

  const { error: insErr } = await supabase.from('furniture_catalog').insert({
    kind,
    label: input.label.trim(),
    description: input.description?.trim() || null,
    width_in: input.widthIn,
    height_in: input.heightIn,
    depth_in: input.depthIn,
    clearance_in: input.clearanceIn ?? null,
    is_builtin: false,
    model_url: objectPath,
    thumbnail_path: thumbnailPath,
    tags,
    categories: input.categories ?? ['decor_art'],
    user_id: input.userId,
    visibility: input.visibility ?? 'private',
  });
  if (insErr) throw new Error(insErr.message);

  return { kind, objectPath };
}
