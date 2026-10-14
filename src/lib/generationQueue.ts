import {
  trackModelGenerationFailed,
  trackModelGenerationStarted,
  trackCreditsSpent,
  trackModelGenerationSucceeded,
} from './analytics';
import {
  createConversionJob,
  failInterruptedConversionJob,
  fetchConversionJob,
  keepaliveUpdateConversionJob,
  listOpenTrellisJobs,
  listReadyTrellisJobs,
  updateConversionJob,
} from './conversionJobs';
import {
  deleteGenerationAsset,
  fileFromAsset,
  listGenerationAssets,
  putGenerationAsset,
  type GenerationAssetRecord,
} from './generationQueueStore';
import { MODEL_FILES_BUCKET, signModelObjectPath } from './modelStorage';
import { supabase } from './supabase';
import { trellisAuthHeaders } from './trellisAuth';
import { trellisSiblingUrl } from './trellisApi';
import { ensureJpegForTrellis } from './webpToJpeg';
import { generateGlbFromPhoto } from './trellisGenerate';

const DISMISSED_READY_KEY = 'toova-dismissed-ready-jobs';
const POLL_MS = 4000;
const MAX_POLL_MS = 25 * 60 * 1000;

function classifyFailure(message: string): 'wake_timeout' | 'generation_error' | 'unknown' {
  const m = message.toLowerCase();
  if (/wake|timed? ?out|timeout|gpu|capacity/.test(m)) return 'wake_timeout';
  if (/generat/.test(m)) return 'generation_error';
  return 'unknown';
}

function readDismissedReady(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_READY_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function writeDismissedReady(set: Set<string>): void {
  try {
    sessionStorage.setItem(DISMISSED_READY_KEY, JSON.stringify([...set].slice(-50)));
  } catch {
    /* ignore */
  }
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
  /** Server-owned jobs survive tab close; progress comes from conversion_jobs. */
  serverOwned?: boolean;
  statusMessage?: string | null;
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
const serverOwnedJobs = new Set<string>();

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
    // Server-owned jobs keep running on the BFF — do not interrupt them.
    const processing = items.filter(
      (item) => item.status === 'processing' && !item.serverOwned && !serverOwnedJobs.has(item.jobId),
    );
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
  serverOwnedJobs.delete(jobId);
  const dismissed = readDismissedReady();
  dismissed.add(jobId);
  writeDismissedReady(dismissed);
  await deleteGenerationAsset(jobId);
  removeItem(jobId);
}

async function uploadJobSource(userId: string, jobId: string, file: File): Promise<string> {
  const jpeg = await ensureJpegForTrellis(file);
  const path = `${userId}/jobs/${jobId}/source.jpg`;
  const { error } = await supabase.storage.from(MODEL_FILES_BUCKET).upload(path, jpeg, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw new Error(error.message || 'Could not upload source image.');
  return path;
}

async function downloadJobResult(resultPath: string): Promise<File> {
  const signed = await signModelObjectPath(resultPath);
  if (!signed) throw new Error('Could not sign result download.');
  const res = await fetch(signed);
  if (!res.ok) throw new Error(`Could not download result (${res.status})`);
  const blob = await res.blob();
  return new File([blob], 'generated.glb', { type: blob.type || 'model/gltf-binary' });
}

async function submitDurableJob(jobId: string): Promise<void> {
  const authHeaders = await trellisAuthHeaders();
  const res = await fetch(trellisSiblingUrl('jobs'), {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ job_id: jobId }),
  });
  if (!res.ok && res.status !== 202) {
    const text = await res.text();
    throw new Error(text || `Could not start durable job (${res.status})`);
  }
}

async function pollDurableJob(
  jobId: string,
  signal: AbortSignal,
  onStatus: (message: string) => void,
): Promise<File> {
  const deadline = Date.now() + MAX_POLL_MS;
  onStatus('Waiting for a free GPU…');
  while (Date.now() < deadline) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const row = await fetchConversionJob(jobId);
    if (!row) throw new Error('Job disappeared.');
    if (row.status === 'completed' && row.result_path) {
      onStatus('Your model is ready');
      return downloadJobResult(row.result_path);
    }
    if (row.status === 'failed') {
      throw new Error(row.error || 'Generation failed');
    }
    onStatus(
      row.status === 'processing' ? 'Waiting for a free GPU… generating…' : 'Waiting for a free GPU…',
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, POLL_MS);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  }
  throw new Error('Generation timed out waiting for the GPU.');
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
      serverOwned: true,
      statusMessage: 'Uploading photo…',
    };
    upsertItem(item);
    serverOwnedJobs.add(jobId);

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

async function runDurableItem(next: GenerationQueueItem): Promise<void> {
  const waiter = waiters.get(next.jobId);
  const startedAt = Date.now();
  activeJobId = next.jobId;
  activeAbort = new AbortController();
  const signal = activeAbort.signal;

  try {
    if (!next.sourceFile) throw new Error('Missing source image for queued generation.');
    patchItem(next.jobId, {
      status: 'processing',
      error: null,
      serverOwned: true,
      statusMessage: 'Uploading photo…',
    });
    waiter?.onStatus('Uploading photo…');

    const sourcePath = await uploadJobSource(next.userId, next.jobId, next.sourceFile);
    await updateConversionJob(next.jobId, {
      status: 'processing',
      source_path: sourcePath,
      server_owned: true,
      error: null,
    });
    waiter?.onStatus('Waiting for a free GPU…');
    patchItem(next.jobId, { statusMessage: 'Waiting for a free GPU…' });

    await submitDurableJob(next.jobId);
    const glbFile = await pollDurableJob(next.jobId, signal, (message) => {
      waiter?.onStatus(message);
      patchItem(next.jobId, { statusMessage: message });
    });

    trackModelGenerationSucceeded({ job_id: next.jobId, duration_ms: Date.now() - startedAt });
    trackCreditsSpent({ cost: 5, source: 'trellis' });
    const ready: GenerationQueueItem = {
      ...next,
      status: 'ready',
      error: null,
      glbFile,
      sourceFile: null,
      serverOwned: true,
      statusMessage: 'Your model is ready',
    };
    upsertItem(ready);
    await persistAsset(ready, 'result');
    waiters.delete(next.jobId);
    waiter?.resolve({ glbFile, jobId: next.jobId });
    if (waiter) await dismissGenerationQueueItem(next.jobId);
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    const cancelled = userCancelled.has(next.jobId) || Boolean(waiter?.signal.aborted);
    // User closed the tab / aborted local waiter — server keeps going.
    if (isAbort && !cancelled) {
      patchItem(next.jobId, {
        status: 'processing',
        statusMessage: 'Generating in the background…',
        sourceFile: null,
      });
      waiters.delete(next.jobId);
      return;
    }
    if (isAbort && cancelled) {
      // Leave server job alone; just reject local waiter.
      waiters.delete(next.jobId);
      waiter?.reject(err);
      return;
    }
    const message = err instanceof Error ? err.message : 'Generation failed';
    // Prefer durable path; if submit failed early, fall back to client generate once.
    if (/Could not start durable job|Could not upload source/i.test(message) && next.sourceFile) {
      try {
        waiter?.onStatus('Retrying on this device…');
        const glbFile = await generateGlbFromPhoto(next.sourceFile, signal, (m) => waiter?.onStatus(m));
        await updateConversionJob(next.jobId, { status: 'completed', label: next.label, server_owned: false });
        trackModelGenerationSucceeded({ job_id: next.jobId, duration_ms: Date.now() - startedAt });
        trackCreditsSpent({ cost: 5, source: 'trellis' });
        const ready: GenerationQueueItem = {
          ...next,
          status: 'ready',
          error: null,
          glbFile,
          sourceFile: null,
          serverOwned: false,
        };
        upsertItem(ready);
        await persistAsset(ready, 'result');
        waiters.delete(next.jobId);
        waiter?.resolve({ glbFile, jobId: next.jobId });
        if (waiter) await dismissGenerationQueueItem(next.jobId);
        return;
      } catch (fallbackErr) {
        const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : message;
        await updateConversionJob(next.jobId, { status: 'failed', error: fbMsg });
        trackModelGenerationFailed({ job_id: next.jobId, failure_reason: classifyFailure(fbMsg) });
        patchItem(next.jobId, { status: 'failed', error: fbMsg });
        waiters.delete(next.jobId);
        waiter?.reject(fallbackErr);
        await deleteGenerationAsset(next.jobId);
        return;
      }
    }
    await updateConversionJob(next.jobId, { status: 'failed', error: message });
    trackModelGenerationFailed({
      job_id: next.jobId,
      failure_reason: classifyFailure(message),
    });
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

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  emit();
  try {
    while (true) {
      const next = items.find((item) => item.status === 'queued' && item.sourceFile);
      if (!next) break;
      await cacheSessionToken();
      await runDurableItem(next);
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
  const dismissed = readDismissedReady();

  try {
    const [openJobs, readyJobs, assets] = await Promise.all([
      listOpenTrellisJobs(userId),
      listReadyTrellisJobs(userId),
      listGenerationAssets(userId),
    ]);
    const assetsByJob = new Map(assets.map((asset) => [asset.jobId, asset]));
    const resumed: string[] = [];

    for (const job of readyJobs) {
      if (dismissed.has(job.id) || items.some((item) => item.jobId === job.id)) continue;
      if (!job.result_path) continue;
      try {
        const glbFile = await downloadJobResult(job.result_path);
        upsertItem({
          jobId: job.id,
          userId,
          label: job.label || 'Image → 3D',
          status: 'ready',
          error: null,
          sourceFile: null,
          glbFile,
          serverOwned: true,
          statusMessage: 'Your model is ready',
        });
      } catch (err) {
        console.warn('[generationQueue] claim ready job failed', job.id, err);
      }
    }

    for (const job of openJobs) {
      if (inFlightJobIds.has(job.id) || items.some((item) => item.jobId === job.id)) continue;

      if (job.server_owned) {
        serverOwnedJobs.add(job.id);
        upsertItem({
          jobId: job.id,
          userId,
          label: job.label || 'Image → 3D',
          status: 'processing',
          error: null,
          sourceFile: null,
          glbFile: null,
          serverOwned: true,
          statusMessage: 'Waiting for a free GPU…',
        });
        void watchServerJob(job.id, userId, job.label || 'Image → 3D');
        continue;
      }

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
          serverOwned: true,
        });
        resumed.push(job.id);
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

async function watchServerJob(jobId: string, userId: string, label: string): Promise<void> {
  const controller = new AbortController();
  try {
    const glbFile = await pollDurableJob(jobId, controller.signal, (message) => {
      patchItem(jobId, { statusMessage: message, status: 'processing' });
    });
    upsertItem({
      jobId,
      userId,
      label,
      status: 'ready',
      error: null,
      sourceFile: null,
      glbFile,
      serverOwned: true,
      statusMessage: 'Your model is ready',
    });
    await persistAsset(
      {
        jobId,
        userId,
        label,
        status: 'ready',
        error: null,
        sourceFile: null,
        glbFile,
        serverOwned: true,
      },
      'result',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    if (message === 'Aborted') return;
    patchItem(jobId, { status: 'failed', error: message });
  }
}
