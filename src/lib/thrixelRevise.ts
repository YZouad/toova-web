import type { GalleryModel } from '../hooks/useGalleryCatalog';
import {
  formatInchDimensions,
  prepareGlbForCatalogUpload,
  readGlbAxisBoundsWithTimeout,
} from './glbImportPipeline';
import { replaceCatalogModelGlb } from './replaceCatalogModelGlb';
import type { ThrixelRevisionOp } from './thrixelApi';
import {
  stageAfterRevision,
  upsertCatalogThrixelAsset,
  type ThrixelCatalogStage,
} from './thrixelCatalogAssets';
import { reviseGlbWithThrixel } from './thrixelGenerate';

export async function runThrixelRevision(input: {
  userId: string;
  model: Pick<GalleryModel, 'kind' | 'visibility'>;
  submissionId: string;
  op: ThrixelRevisionOp;
  change?: string;
  prompt?: string;
  targetTriangles?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}): Promise<{
  submissionId: string;
  stage: ThrixelCatalogStage;
  widthIn: number;
  heightIn: number;
  depthIn: number;
  storagePath: string;
  updatedRoomItems: number;
}> {
  const { glbFile, submissionId } = await reviseGlbWithThrixel(
    {
      submissionId: input.submissionId,
      op: input.op,
      change: input.change,
      prompt: input.prompt,
      targetTriangles: input.targetTriangles,
    },
    input.signal,
    input.onProgress,
  );

  input.onProgress?.('Optimizing for Toova…');
  const { uploadFile } = await prepareGlbForCatalogUpload(glbFile);
  let widthIn = 24;
  let heightIn = 24;
  let depthIn = 24;
  const bounds = await readGlbAxisBoundsWithTimeout(uploadFile);
  if (bounds) {
    const formatted = formatInchDimensions(bounds);
    widthIn = Number(formatted.widthIn);
    heightIn = Number(formatted.heightIn);
    depthIn = Number(formatted.depthIn);
  }

  input.onProgress?.('Updating your library…');
  const replaced = await replaceCatalogModelGlb({
    userId: input.userId,
    kind: input.model.kind,
    glbFile: uploadFile,
    widthIn,
    heightIn,
    depthIn,
    visibility: input.model.visibility,
  });

  const stage = stageAfterRevision(input.op);
  await upsertCatalogThrixelAsset({
    kind: input.model.kind,
    userId: input.userId,
    submissionId,
    stage,
  });

  return {
    submissionId,
    stage,
    widthIn,
    heightIn,
    depthIn,
    storagePath: replaced.objectPath,
    updatedRoomItems: replaced.updatedRoomItems,
  };
}

/** Revise a Thrixel model before it is saved to the catalog (import flow). */
export async function runThrixelImportRevision(input: {
  submissionId: string;
  op: ThrixelRevisionOp;
  change?: string;
  prompt?: string;
  targetTriangles?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}): Promise<{
  glbFile: File;
  uploadFile: File;
  submissionId: string;
  stage: ThrixelCatalogStage;
  widthIn: string;
  heightIn: string;
  depthIn: string;
}> {
  const { glbFile, submissionId } = await reviseGlbWithThrixel(
    {
      submissionId: input.submissionId,
      op: input.op,
      change: input.change,
      prompt: input.prompt,
      targetTriangles: input.targetTriangles,
    },
    input.signal,
    input.onProgress,
  );

  input.onProgress?.('Optimizing for Toova…');
  const { uploadFile } = await prepareGlbForCatalogUpload(glbFile);
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

  return {
    glbFile,
    uploadFile,
    submissionId,
    stage: stageAfterRevision(input.op),
    widthIn,
    heightIn,
    depthIn,
  };
}
