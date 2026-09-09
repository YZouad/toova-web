import {
  trackModelGenerationFailed,
  trackModelGenerationStarted,
  trackModelGenerationSucceeded,
} from './analytics';
import {
  createConversionJob,
  failInterruptedConversionJob,
  keepaliveUpdateConversionJob,
  listOpenTrellisJobs,
  updateConversionJob,
} from './conversionJobs';
import {
  deleteGenerationAsset,
  fileFromAsset,
  listGenerationAssets,
  putGenerationAsset,
  type GenerationAssetRecord,
} from './generationQueueStore';
import { supabase } from './supabase';
import { generateGlbFromPhoto } from './trellisGenerate';

function classifyFailure(message: string): 'wake_timeout' | 'generation_error' | 'unknown' {
  const m = message.toLowerCase();
  if (/wake|timed? ?out|timeout/.test(m)) return 'wake_timeout';
  if (/generat/.test(m)) return 'generation_error';
  return 'unknown';
}

export type GenerationQueueStatus = 'queued' | 'processing' | 'ready' | 'failed';

export type GenerationQueueItem = {
  jobId: string;
  userId: string;
  label: string;
  status: GenerationQueueStatus;
  error: string | null;
  sourceFile: File | null;
  glbFile: File | null;
};

export type GenerationQueueSnapshot = {
  items: GenerationQueueItem[];
  draining: boolean;
};

type Waiter = {
  onStatus: (message: string) => void;
  resolve: (value: { glbFile: File; jobId: string }) => void;
  reject: (err: unknown) => void;
  signal: AbortSignal;
};

const listeners = new Set<() => void>();
const waiters = new Map<string, Waiter>();
const userCancelled = new Set<string>();

let items: GenerationQueueItem[] = [];
let draining = false;
let cachedSnapshot: GenerationQueueSnapshot = { items, draining };
let cachedAccessToken: string | null = null;
let recoverPromise: Promise<void> | null = null;
let recoverUserId: string | null = null;
const inFlightJobIds = new Set<string>();
let pageHideBound = false;
let activeAbort: AbortController | null = null;
let activeJobId: string | null = null;

function emit() {
  cachedSnapshot = { items, draining };
  listeners.forEach((listener) => listener());
}

export function subscribeGenerationQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGenerationQueueSnapshot(): GenerationQueueSnapshot {
  return cachedSnapshot;
}

async function cacheSessionToken(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  cachedAccessToken = data.session?.access_token ?? null;
}

function upsertItem(next: GenerationQueueItem) {
  const idx = items.findIndex((item) => item.jobId === next.jobId);
  if (idx >= 0) items = items.map((item, i) => (i === idx ? next : item));
  else items = [...items, next];
  emit();
}

function patchItem(jobId: string, patch: Partial<GenerationQueueItem>) {
  items = items.map((item) => (item.jobId === jobId ? { ...item, ...patch } : item));
  emit();
}

function removeItem(jobId: string) {
  items = items.filter((item) => item.jobId !== jobId);
  emit();
}

async function persistAsset(item: GenerationQueueItem, kind: 'source' | 'result'): Promise<void> {
  const file = kind === 'result' ? item.glbFile : item.sourceFile;
  if (!file) return;
  const record: GenerationAssetRecord = {
    jobId: item.jobId,
    userId: item.userId,
    label: item.label,
    kind,
    blob: file,
    fileName: file.name,
    type: file.type,
  };
  await putGenerationAsset(record);
}

function bindPageHide() {
  if (pageHideBound || typeof window === 'undefined') return;
  pageHideBound = true;
  const onHide = () => {
    const processing = items.filter((item) => item.status === 'processing');
    for (const item of processing) {
      keepaliveUpdateConversionJob(item.jobId, cachedAccessToken, { status: 'queued' });
      patchItem(item.jobId, { status: 'queued' });
    }
  };
  window.addEventListener('pagehide', onHide);
}

export async function dismissGenerationQueueItem(jobId: string): Promise<void> {
  waiters.delete(jobId);
  userCancelled.delete(jobId);
  await deleteGenerationAsset(jobId);
  removeItem(jobId);
}

export async function enqueuePhotoGenerate(input: {
  userId: string;
  file: File;
  label: string;
  signal: AbortSignal;
  onStatus: (message: string) => void;
}): Promise<{ glbFile: File; jobId: string | null }> {
  bindPageHide();
  await cacheSessionToken();

  const jobId = await createConversionJob({
    userId: input.userId,
    source: 'trellis',
    status: 'queued',
    label: input.label,
  });
  if (!jobId) {
    const glbFile = await generateGlbFromPhoto(input.file, input.signal, input.onStatus);
    return { glbFile, jobId: null };
  }

  inFlightJobIds.add(jobId);
  try {
    trackModelGenerationStarted({ job_id: jobId, source_type: 'photo' });

    const item: GenerationQueueItem = {
      jobId,
      userId: input.userId,
      label: input.label,
      status: 'queued',
      error: null,
      sourceFile: input.file,
      glbFile: null,
    };
    upsertItem(item);
    try {
      await persistAsset(item, 'source');
    } catch (err) {
      console.warn('[generationQueue] persist source failed', err);
    }

    input.signal.addEventListener(
      'abort',
      () => {
        userCancelled.add(jobId);
        if (activeJobId === jobId) activeAbort?.abort();
      },
      { once: true },
    );

    return await new Promise<{ glbFile: File; jobId: string }>((resolve, reject) => {
      waiters.set(jobId, {
        onStatus: input.onStatus,
        resolve,
        reject,
        signal: input.signal,
      });
      void drainQueue();
    });
  } finally {
    inFlightJobIds.delete(jobId);
  }
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  emit();
  try {
    while (true) {
      const next = items.find((item) => item.status === 'queued' && item.sourceFile);
      if (!next) break;

      await cacheSessionToken();
      activeJobId = next.jobId;
      activeAbort = new AbortController();
      patchItem(next.jobId, { status: 'processing', error: null });
      await updateConversionJob(next.jobId, { status: 'processing', error: null });

      const waiter = waiters.get(next.jobId);
      const startedAt = Date.now();

      try {
        if (!next.sourceFile) throw new Error('Missing source image for queued generation.');
        let lastBeat = 0;
        const glbFile = await generateGlbFromPhoto(
          next.sourceFile,
          activeAbort.signal,
          (message) => {
            waiter?.onStatus(message);
            const now = Date.now();
            if (now - lastBeat < 15_000) return;
            lastBeat = now;
            void updateConversionJob(next.jobId, {});
          },
        );
        await updateConversionJob(next.jobId, { status: 'completed', label: next.label });
        trackModelGenerationSucceeded({ job_id: next.jobId, duration_ms: Date.now() - startedAt });
        const ready: GenerationQueueItem = {
          ...next,
          status: 'ready',
          error: null,
          glbFile,
          sourceFile: null,
        };
        upsertItem(ready);
        await persistAsset(ready, 'result');
        waiters.delete(next.jobId);
        waiter?.resolve({ glbFile, jobId: next.jobId });
        if (waiter) await dismissGenerationQueueItem(next.jobId);
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        const cancelled = userCancelled.has(next.jobId) || Boolean(waiter?.signal.aborted);
        if (isAbort && !cancelled) {
          keepaliveUpdateConversionJob(next.jobId, cachedAccessToken, { status: 'queued' });
          patchItem(next.jobId, { status: 'queued' });
          break;
        }
        const message = isAbort
          ? 'Cancelled'
          : err instanceof Error
            ? err.message
            : 'Generation failed';
        await updateConversionJob(next.jobId, { status: 'failed', error: message });
        if (!isAbort) {
          trackModelGenerationFailed({
            job_id: next.jobId,
            failure_reason: classifyFailure(message),
          });
        }
        patchItem(next.jobId, { status: 'failed', error: message });
        waiters.delete(next.jobId);
        waiter?.reject(err);
        await deleteGenerationAsset(next.jobId);
      } finally {
        activeAbort = null;
        activeJobId = null;
        userCancelled.delete(next.jobId);
      }
    }
  } finally {
    draining = false;
    emit();
  }
}

export function processGenerationQueue(): void {
  void drainQueue();
}

export async function recoverGenerationQueue(userId: string): Promise<void> {
  if (recoverUserId === userId && recoverPromise) return recoverPromise;
  recoverUserId = userId;
  recoverPromise = recoverGenerationQueueOnce(userId);
  return recoverPromise;
}

async function recoverGenerationQueueOnce(userId: string): Promise<void> {
  bindPageHide();
  await cacheSessionToken();

  try {

  const [openJobs, assets] = await Promise.all([
    listOpenTrellisJobs(userId),
    listGenerationAssets(userId),
  ]);
  const assetsByJob = new Map(assets.map((asset) => [asset.jobId, asset]));
  const resumed: string[] = [];

  for (const job of openJobs) {
    const asset = assetsByJob.get(job.id);
    if (asset?.kind === 'result') {
      upsertItem({
        jobId: job.id,
        userId,
        label: job.label || asset.label || 'Image → 3D',
        status: 'ready',
        error: null,
        sourceFile: null,
        glbFile: fileFromAsset(asset),
      });
      if (job.status === 'queued' || job.status === 'processing') {
        await updateConversionJob(job.id, { status: 'completed', error: null });
      }
      continue;
    }
    if (asset?.kind === 'source') {
      upsertItem({
        jobId: job.id,
        userId,
        label: job.label || asset.label || 'Image → 3D',
        status: 'queued',
        error: null,
        sourceFile: fileFromAsset(asset),
        glbFile: null,
      });
      if (job.status === 'processing') {
        await updateConversionJob(job.id, { status: 'queued', error: null });
      }
      resumed.push(job.id);
      continue;
    }
    if (inFlightJobIds.has(job.id) || items.some((item) => item.jobId === job.id)) {
      continue;
    }
    await failInterruptedConversionJob(job.id);
  }

  for (const asset of assets) {
    if (items.some((item) => item.jobId === asset.jobId)) continue;
    if (asset.kind === 'result') {
      upsertItem({
        jobId: asset.jobId,
        userId,
        label: asset.label || 'Image → 3D',
        status: 'ready',
        error: null,
        sourceFile: null,
        glbFile: fileFromAsset(asset),
      });
    }
  }

  if (resumed.length > 0) void drainQueue();
  } catch (err) {
    recoverUserId = null;
    recoverPromise = null;
    throw err;
  }
}
