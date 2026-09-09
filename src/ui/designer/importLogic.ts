import { detectCatalogModelSource, uploadCatalogModel } from '../../lib/catalogModelUpload';
import { createPosterGlb } from '../../lib/createPosterGlb';
import { createConversionJob, updateConversionJob } from '../../lib/conversionJobs';
import { dismissGenerationQueueItem, enqueuePhotoGenerate } from '../../lib/generationQueue';
import {
  formatInchDimensions,
  prepareGlbForCatalogUpload,
  readGlbAxisBoundsWithTimeout,
} from '../../lib/glbImportPipeline';
import { validateCatalogText } from '../../lib/bannedWords';
import { resolveBrowsableModelUrl } from '../../lib/modelStorage';
import type { CatalogCategorySlug } from '../../lib/catalogCategories';
import type { CatalogModel } from './chromeTypes';

/** Buckets a raw error message into the tracking plan's model_generation_failed reason enum. */
export function classifyGenerationFailure(message: string): 'wake_timeout' | 'generation_error' | 'unknown' {
  const m = message.toLowerCase();
  if (/wake|timed? ?out|timeout/.test(m)) return 'wake_timeout';
  if (/generat/.test(m)) return 'generation_error';
  return 'unknown';
}

export type GeneratePhase = 'idle' | 'generating' | 'downloading';

export interface ImportFormState {
  title: string;
  description: string;
  categories: CatalogCategorySlug[];
  widthIn: string;
  heightIn: string;
  depthIn: string;
  clearanceIn: string;
  listInGallery: boolean;
}

export interface PrepareGlbResult {
  uploadFile: File;
  warning: string | null;
  widthIn: string;
  heightIn: string;
  depthIn: string;
}

export async function prepareGlbFile(file: File): Promise<PrepareGlbResult> {
  const { uploadFile, warning } = await prepareGlbForCatalogUpload(file);
  let widthIn = '24';
  let heightIn = '24';
  let depthIn = '24';
  const bounds = await readGlbAxisBoundsWithTimeout(uploadFile);
  if (bounds) {
    const formatted = formatInchDimensions(bounds);
    widthIn = formatted.widthIn;
    heightIn = formatted.heightIn;
    depthIn = formatted.depthIn;
  }
  return { uploadFile, warning: warning ?? null, widthIn, heightIn, depthIn };
}

export async function runPhotoGenerate(
  imageFile: File,
  userId: string,
  signal: AbortSignal,
  onStatus: (message: string) => void,
): Promise<{ glbFile: File; jobId: string | null }> {
  return enqueuePhotoGenerate({
    userId,
    file: imageFile,
    label: imageFile.name || 'Image → 3D',
    signal,
    onStatus,
  });
}

export async function buildPosterGlb(
  croppedBlob: Blob,
  widthIn: number,
  heightIn: number,
  depthIn: number,
): Promise<File> {
  return createPosterGlb(croppedBlob, { widthIn, heightIn, depthIn });
}

export interface SubmitImportInput {
  userId: string;
  file: File;
  uploadFile: File;
  form: ImportFormState;
  posterCroppedBlob?: Blob | null;
  priorJobId?: string | null;
}

export async function submitCatalogImport(
  input: SubmitImportInput,
): Promise<CatalogModel> {
  const { userId, file, uploadFile, form } = input;
  const label = form.title.trim();
  if (!label) throw new Error('Title is required.');
  if (form.categories.length < 1) {
    throw new Error('Pick at least one category (up to three).');
  }

  const banned = validateCatalogText({
    label,
    description: form.description.trim() || null,
  });
  if (banned) throw new Error(banned);

  const w = Number(form.widthIn);
  const h = Number(form.heightIn);
  const d = Number(form.depthIn);
  if (![w, h, d].every((x) => Number.isFinite(x) && x > 0)) {
    throw new Error('Width, height, and depth must be positive numbers (inches).');
  }

  let clearance: number | null = null;
  if (form.clearanceIn.trim() !== '') {
    const c = Number(form.clearanceIn);
    if (!Number.isFinite(c) || c < 0) {
      throw new Error('Clearance must be a non-negative number or empty.');
    }
    clearance = c;
  }

  const tags = file.name.toLowerCase() === 'poster.glb' ? ['poster'] : [];
  const source = detectCatalogModelSource(file.name, tags);

  let jobId = input.priorJobId ?? null;
  const hadPriorJob = Boolean(jobId);
  if (!jobId) {
    jobId = await createConversionJob({
      userId,
      source,
      status: 'processing',
      label,
    });
  } else {
    await updateConversionJob(jobId, { label });
  }

  try {
    const { kind, objectPath } = await uploadCatalogModel({
      userId,
      glbFile: uploadFile,
      label,
      widthIn: w,
      heightIn: h,
      depthIn: d,
      clearanceIn: clearance,
      description: form.description.trim() || null,
      visibility: form.listInGallery ? 'public' : 'private',
      categories: form.categories,
      tags,
      preferFlatImage: source === 'poster' ? input.posterCroppedBlob ?? null : null,
      originalFileName: file.name,
    });

    if (jobId) {
      await updateConversionJob(jobId, {
        status: 'completed',
        kind,
        label,
        error: null,
      });
      await dismissGenerationQueueItem(jobId);
    }

    const result = {
      kind,
      label,
      description: form.description.trim() || null,
      tags,
      categories: form.categories,
      width_in: w,
      height_in: h,
      depth_in: d,
      clearance_in: clearance,
      userId,
      visibility: form.listInGallery ? 'public' : 'private',
      isBuiltin: false,
      likesCount: 0,
      downloadsCount: 0,
      viewsCount: 0,
      createdAt: new Date().toISOString(),
      creatorHandle: null,
      creatorDisplayName: null,
      likedByMe: false,
      hotScore: 0,
      storagePath: objectPath,
      signedUrl: await resolveBrowsableModelUrl(objectPath),
      previewUrl: null,
    };
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    if (jobId && !hadPriorJob) {
      await updateConversionJob(jobId, {
        status: 'failed',
        error: message,
        label,
      });
    }
    throw err;
  }
}
