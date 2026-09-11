import {
  MAX_BATCH_EVENTS,
  type NormalizedAnalyticsEvent,
} from './analyticsSchema';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase';

export const ANALYTICS_QUEUE_KEY = 'toova-analytics-queue';
export const ANALYTICS_SENT_KEY = 'toova-analytics-sent-ids';
export const COLLECT_ANALYTICS_PATH = '/functions/v1/collect-analytics';

const MAX_QUEUE = 80;
const MAX_SENT_IDS = 400;
const MAX_ATTEMPTS = 4;

export interface QueuedAnalyticsEvent extends NormalizedAnalyticsEvent {
  attempts: number;
}

type QueueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function memoryStore(): QueueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

let store: QueueStore | null = null;
let flushing = false;

function getStore(): QueueStore {
  if (store) return store;
  try {
    if (typeof sessionStorage !== 'undefined') {
      store = sessionStorage;
      return store;
    }
  } catch {
    /* private mode */
  }
  store = memoryStore();
  return store;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = getStore().getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    getStore().setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

function sentIds(): Set<string> {
  const arr = readJson<string[]>(ANALYTICS_SENT_KEY, []);
  return new Set(Array.isArray(arr) ? arr : []);
}

function rememberSent(ids: string[]): void {
  const next = [...sentIds()];
  for (const id of ids) {
    if (!next.includes(id)) next.push(id);
  }
  writeJson(ANALYTICS_SENT_KEY, next.slice(-MAX_SENT_IDS));
}

export function readAnalyticsQueue(): QueuedAnalyticsEvent[] {
  const raw = readJson<QueuedAnalyticsEvent[]>(ANALYTICS_QUEUE_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

function writeQueue(events: QueuedAnalyticsEvent[]): void {
  writeJson(ANALYTICS_QUEUE_KEY, events.slice(-MAX_QUEUE));
}

export function enqueueAnalyticsEvent(event: NormalizedAnalyticsEvent): boolean {
  if (sentIds().has(event.event_id)) return false;
  const queue = readAnalyticsQueue();
  if (queue.some((row) => row.event_id === event.event_id)) return false;
  queue.push({ ...event, attempts: 0 });
  writeQueue(queue);
  return true;
}

export function collectAnalyticsUrl(): string {
  return `${SUPABASE_URL}${COLLECT_ANALYTICS_PATH}`;
}

export async function flushAnalyticsQueue(options?: {
  fetchImpl?: typeof fetch;
  accessToken?: string | null;
  keepalive?: boolean;
}): Promise<{ sent: number; remaining: number; failed: boolean }> {
  if (flushing) {
    const remaining = readAnalyticsQueue().length;
    return { sent: 0, remaining, failed: false };
  }
  const queue = readAnalyticsQueue();
  if (queue.length === 0) return { sent: 0, remaining: 0, failed: false };

  flushing = true;
  const fetchImpl = options?.fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) {
    flushing = false;
    return { sent: 0, remaining: queue.length, failed: true };
  }

  const batch = queue.slice(0, MAX_BATCH_EVENTS);
  const rest = queue.slice(MAX_BATCH_EVENTS);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
    };
    if (options?.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    }
    const response = await fetchImpl(collectAnalyticsUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ events: batch.map(({ attempts: _attempts, ...event }) => event) }),
      keepalive: options?.keepalive ?? true,
    });
    if (response.ok || response.status === 204) {
      rememberSent(batch.map((event) => event.event_id));
      writeQueue(rest);
      flushing = false;
      if (rest.length > 0) {
        return flushAnalyticsQueue(options);
      }
      return { sent: batch.length, remaining: 0, failed: false };
    }
    if (response.status === 401 || response.status === 403) {
      writeQueue(rest);
      flushing = false;
      return { sent: 0, remaining: rest.length, failed: true };
    }
    const retried = batch
      .map((event) => ({ ...event, attempts: event.attempts + 1 }))
      .filter((event) => event.attempts < MAX_ATTEMPTS);
    writeQueue([...retried, ...rest]);
    flushing = false;
    return { sent: 0, remaining: retried.length + rest.length, failed: true };
  } catch {
    const retried = batch
      .map((event) => ({ ...event, attempts: event.attempts + 1 }))
      .filter((event) => event.attempts < MAX_ATTEMPTS);
    writeQueue([...retried, ...rest]);
    flushing = false;
    return { sent: 0, remaining: retried.length + rest.length, failed: true };
  }
}

export function resetAnalyticsQueueForTests(): void {
  store = memoryStore();
  flushing = false;
}
