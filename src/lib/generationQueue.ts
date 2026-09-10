import {
  loadGenerationQueue,
  persistGenerationQueue,
  type GenerationQueueEntry,
  type GenerationQueueSource,
  type GenerationQueueStatus,
} from './generationQueueStore';

export type { GenerationQueueEntry, GenerationQueueSource, GenerationQueueStatus };

/** In-memory snapshot. Rehydrated from localStorage on first load. */
let cachedSnapshot: GenerationQueueEntry[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  persistGenerationQueue(cachedSnapshot);
  for (const listener of listeners) listener();
}

export function hydrateGenerationQueueFromStorage(now = Date.now()): GenerationQueueEntry[] {
  cachedSnapshot = loadGenerationQueue(now);
  hydrated = true;
  return cachedSnapshot;
}

function ensureHydrated(): void {
  if (!hydrated) hydrateGenerationQueueFromStorage();
}

export function getGenerationQueueSnapshot(): GenerationQueueEntry[] {
  ensureHydrated();
  return cachedSnapshot;
}

export function subscribeGenerationQueue(listener: () => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function upsertGenerationQueueEntry(
  patch: Pick<GenerationQueueEntry, 'id'> & Partial<Omit<GenerationQueueEntry, 'id'>>,
): GenerationQueueEntry {
  ensureHydrated();
  const now = Date.now();
  const existing = cachedSnapshot.find((e) => e.id === patch.id);
  const next: GenerationQueueEntry = {
    id: patch.id,
    label: patch.label ?? existing?.label ?? 'Generation',
    source: patch.source ?? existing?.source ?? 'trellis',
    status: patch.status ?? existing?.status ?? 'processing',
    message: patch.message ?? existing?.message,
    createdAt: existing?.createdAt ?? patch.createdAt ?? now,
    updatedAt: now,
    jobId: patch.jobId !== undefined ? patch.jobId : existing?.jobId,
    submissionId: patch.submissionId ?? existing?.submissionId,
  };
  cachedSnapshot = [next, ...cachedSnapshot.filter((e) => e.id !== patch.id)];
  emit();
  return next;
}

export function clearGenerationQueue(): void {
  cachedSnapshot = [];
  hydrated = true;
  emit();
}
