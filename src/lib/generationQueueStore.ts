export const GENERATION_QUEUE_KEY = 'toova-generation-queue';
export const GENERATION_QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type GenerationQueueStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type GenerationQueueSource = 'trellis' | 'thrixel';

export interface GenerationQueueEntry {
  id: string;
  label: string;
  source: GenerationQueueSource;
  status: GenerationQueueStatus;
  message?: string;
  createdAt: number;
  updatedAt: number;
  jobId?: string | null;
  submissionId?: string;
}

export function isGenerationQueueEntry(raw: unknown): raw is GenerationQueueEntry {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  const status = o.status;
  const source = o.source;
  return (
    typeof o.id === 'string' &&
    typeof o.label === 'string' &&
    (source === 'trellis' || source === 'thrixel') &&
    (status === 'queued' || status === 'processing' || status === 'completed' || status === 'failed') &&
    typeof o.createdAt === 'number' &&
    typeof o.updatedAt === 'number'
  );
}

export function dropStaleGenerationEntries(
  entries: GenerationQueueEntry[],
  now = Date.now(),
  maxAgeMs = GENERATION_QUEUE_MAX_AGE_MS,
): GenerationQueueEntry[] {
  return entries.filter((e) => now - e.updatedAt <= maxAgeMs);
}

export function loadGenerationQueue(now = Date.now()): GenerationQueueEntry[] {
  try {
    const raw = localStorage.getItem(GENERATION_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return dropStaleGenerationEntries(parsed.filter(isGenerationQueueEntry), now);
  } catch {
    return [];
  }
}

export function persistGenerationQueue(entries: GenerationQueueEntry[]): void {
  try {
    localStorage.setItem(GENERATION_QUEUE_KEY, JSON.stringify(entries));
  } catch {
    /* ignore quota / private mode */
  }
}
