import type { GeneratePhase } from '../importLogic';

/** Photo generation job state lifted outside the sheet so closing mid-job does not abort or crash. */
export type PhotoJobSnapshot = {
  generating: boolean;
  phase: GeneratePhase;
  status: string | null;
  error: string | null;
  elapsedSec: number;
  imageFile: File | null;
  glbFile: File | null;
  jobId: string | null;
};

const INITIAL: PhotoJobSnapshot = {
  generating: false,
  phase: 'idle',
  status: null,
  error: null,
  elapsedSec: 0,
  imageFile: null,
  glbFile: null,
  jobId: null,
};

let snapshot: PhotoJobSnapshot = { ...INITIAL };
const listeners = new Set<() => void>();
let elapsedTimer: ReturnType<typeof setInterval> | null = null;

export const photoJobAbortRef: { current: AbortController | null } = { current: null };

function emit() {
  listeners.forEach((l) => l());
}

export function subscribePhotoJob(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPhotoJobSnapshot(): PhotoJobSnapshot {
  return snapshot;
}

export function patchPhotoJob(patch: Partial<PhotoJobSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

export function startPhotoJobElapsed() {
  if (elapsedTimer) return;
  elapsedTimer = setInterval(() => {
    patchPhotoJob({ elapsedSec: snapshot.elapsedSec + 1 });
  }, 1000);
}

export function stopPhotoJobElapsed() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

export function resetPhotoJob(abort = true) {
  if (abort) {
    photoJobAbortRef.current?.abort();
    photoJobAbortRef.current = null;
  }
  stopPhotoJobElapsed();
  snapshot = { ...INITIAL };
  emit();
}

export function photoJobBusy(): boolean {
  return snapshot.generating;
}
