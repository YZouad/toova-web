import type { ThrixelRevisionOp } from './thrixelApi';
import {
  downloadThrixelGlb,
  fileToDataUrl,
  submitThrixelGeneration,
  submitThrixelRevision,
  waitForThrixelJob,
} from './thrixelApi';
import { ensureJpegForTrellis } from './webpToJpeg';

export interface ThrixelGlbResult {
  glbFile: File;
  submissionId: string;
}

export async function generateGlbWithThrixel(
  input: {
    task?: string;
    imageFile?: File | null;
  },
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<ThrixelGlbResult> {
  const task = input.task?.trim() ?? '';
  let imageDataUrl: string | undefined;

  if (input.imageFile) {
    onProgress?.('Preparing reference image…');
    const jpeg = await ensureJpegForTrellis(input.imageFile);
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    imageDataUrl = await fileToDataUrl(jpeg);
  }

  if (!task && !imageDataUrl) {
    throw new Error('Provide a description or a reference image.');
  }

  onProgress?.('Submitting to Thrixel…');
  const submissionId = await submitThrixelGeneration({
    task: task || undefined,
    imageDataUrl,
    signal,
  });

  await waitForThrixelJob(submissionId, signal, onProgress);
  onProgress?.('Downloading model…');
  const glbFile = await downloadThrixelGlb(submissionId, signal);
  return { glbFile, submissionId };
}

export async function reviseGlbWithThrixel(
  input: {
    submissionId: string;
    op: ThrixelRevisionOp;
    change?: string;
    prompt?: string;
    targetTriangles?: number;
  },
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<ThrixelGlbResult> {
  onProgress?.('Submitting revision to Thrixel…');
  const submissionId = await submitThrixelRevision({
    submissionId: input.submissionId,
    op: input.op,
    change: input.change,
    prompt: input.prompt,
    targetTriangles: input.targetTriangles,
    signal,
  });

  await waitForThrixelJob(submissionId, signal, onProgress);
  onProgress?.('Downloading revised model…');
  const glbFile = await downloadThrixelGlb(submissionId, signal);
  return { glbFile, submissionId };
}
