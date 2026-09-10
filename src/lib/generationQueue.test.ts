import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearGenerationQueue,
  getGenerationQueueSnapshot,
  hydrateGenerationQueueFromStorage,
  upsertGenerationQueueEntry,
} from './generationQueue';
import {
  GENERATION_QUEUE_KEY,
  GENERATION_QUEUE_MAX_AGE_MS,
  persistGenerationQueue,
  type GenerationQueueEntry,
} from './generationQueueStore';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  });
}

function entry(partial: Partial<GenerationQueueEntry> & { id: string }): GenerationQueueEntry {
  const now = Date.now();
  return {
    label: 'Desk from photo',
    source: 'trellis',
    status: 'processing',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('generationQueue rehydrate-from-storage', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    clearGenerationQueue();
  });

  it('writes updates to localStorage and rehydrates them', () => {
    upsertGenerationQueueEntry({
      id: 'job-1',
      label: 'Nightstand',
      source: 'thrixel',
      status: 'processing',
    });
    upsertGenerationQueueEntry({
      id: 'job-1',
      status: 'completed',
      message: 'Ready',
    });

    const raw = localStorage.getItem(GENERATION_QUEUE_KEY);
    expect(raw).toBeTruthy();

    // Simulate a reload: drop the in-memory snapshot and read storage back.
    clearGenerationQueue();
    persistGenerationQueue(JSON.parse(raw!) as GenerationQueueEntry[]);
    const restored = hydrateGenerationQueueFromStorage();
    expect(restored).toHaveLength(1);
    expect(restored[0]?.id).toBe('job-1');
    expect(restored[0]?.status).toBe('completed');
    expect(restored[0]?.label).toBe('Nightstand');
    expect(getGenerationQueueSnapshot()[0]?.status).toBe('completed');
  });

  it('drops entries older than 24h on load instead of showing them stale', () => {
    const now = Date.now();
    persistGenerationQueue([
      entry({ id: 'fresh', updatedAt: now - 60_000, createdAt: now - 60_000, status: 'completed' }),
      entry({
        id: 'stale',
        updatedAt: now - GENERATION_QUEUE_MAX_AGE_MS - 1000,
        createdAt: now - GENERATION_QUEUE_MAX_AGE_MS - 1000,
        status: 'completed',
      }),
    ]);
    const restored = hydrateGenerationQueueFromStorage(now);
    expect(restored.map((e) => e.id)).toEqual(['fresh']);
  });
});
