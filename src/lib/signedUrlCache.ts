import { supabase } from './supabase';

export const SIGNED_URL_CACHE_KEY = 'toova-signed-url-v1';

/** Refresh before the JWT actually dies so a slow load does not 403. */
export const SIGNED_URL_REFRESH_SKEW_MS = 120_000;
const MAX_ENTRIES = 400;

interface CacheEntry {
  url: string;
  exp: number;
}

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

let storageOverride: Storage | null = null;

/** Test hook: inject a Storage and wipe memory. */
export function setSignedUrlCacheStorageForTests(storage: Storage | null): void {
  storageOverride = storage;
  memory.clear();
  inflight.clear();
}

export function clearSignedUrlCache(): void {
  memory.clear();
  inflight.clear();
  removePersisted(SIGNED_URL_CACHE_KEY);
}

/**
 * Snap a requested TTL onto a shared UTC window and return seconds-until-boundary.
 * All mints in the same window share one expiry instant, so a cached token stays
 * valid for every reload until that boundary (minus refresh skew).
 */
export function alignedExpiresIn(
  requestedSec: number,
  nowMs = Date.now(),
): { expiresIn: number; expiresAtMs: number; windowSec: number } {
  const windowSec = snapWindow(requestedSec);
  const windowMs = windowSec * 1000;
  let expiresAtMs = Math.ceil(nowMs / windowMs) * windowMs;
  const minRemaining = Math.min(SIGNED_URL_REFRESH_SKEW_MS, Math.floor(windowMs / 4));
  if (expiresAtMs - nowMs < minRemaining) {
    expiresAtMs += windowMs;
  }
  return {
    windowSec,
    expiresAtMs,
    expiresIn: Math.max(60, Math.round((expiresAtMs - nowMs) / 1000)),
  };
}

function snapWindow(requestedSec: number): number {
  const n = Number.isFinite(requestedSec) ? requestedSec : 3600;
  if (n <= 15 * 60) return 15 * 60;
  if (n <= 60 * 60) return 60 * 60;
  if (n <= 6 * 60 * 60) return 6 * 60 * 60;
  return 24 * 60 * 60;
}

export function signedUrlCacheKey(bucket: string, objectPath: string, scope = ''): string {
  return scope ? `${bucket}:${scope}:${objectPath}` : `${bucket}:${objectPath}`;
}

export function readCachedSignedUrl(key: string, nowMs = Date.now()): string | null {
  const entry = memory.get(key) ?? readPersisted().get(key);
  if (!entry) return null;
  if (entry.exp - nowMs <= SIGNED_URL_REFRESH_SKEW_MS) {
    memory.delete(key);
    return null;
  }
  memory.set(key, entry);
  return entry.url;
}

export function writeCachedSignedUrl(key: string, url: string, expiresAtMs: number): void {
  const entry: CacheEntry = { url, exp: expiresAtMs };
  memory.set(key, entry);
  const all = readPersisted();
  all.set(key, entry);
  persist(all);
}

/** Cached JSON map (share-token URL sets) stored as one signed-url cache entry. */
export function readCachedSignedUrlMap(
  scope: string,
  nowMs = Date.now(),
): Record<string, string> | null {
  const raw = readCachedSignedUrl(`set:${scope}`, nowMs);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [path, url] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof url === 'string' && url) out[path] = url;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function writeCachedSignedUrlMap(
  scope: string,
  urls: Record<string, string>,
  expiresAtMs: number,
): void {
  writeCachedSignedUrl(`set:${scope}`, JSON.stringify(urls), expiresAtMs);
}

/** Sign one private-bucket object, reusing a cached token until near expiry. */
export async function signStoragePath(
  bucket: string,
  objectPath: string,
  requestedSec = 60 * 60,
): Promise<string | null> {
  const trimmed = objectPath.trim();
  if (!trimmed) return null;
  const key = signedUrlCacheKey(bucket, trimmed);
  const cached = readCachedSignedUrl(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    const { expiresIn, expiresAtMs } = alignedExpiresIn(requestedSec);
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(trimmed, expiresIn);
    if (error || !data?.signedUrl) return null;
    writeCachedSignedUrl(key, data.signedUrl, expiresAtMs);
    return data.signedUrl;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, task);
  return task;
}

/** Batch-sign, skipping paths that already have a live cached token. */
export async function signStoragePaths(
  bucket: string,
  paths: string[],
  requestedSec = 60 * 60,
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.map((p) => p.trim()).filter(Boolean))];
  const out: Record<string, string> = {};
  const missing: string[] = [];

  for (const path of unique) {
    const cached = readCachedSignedUrl(signedUrlCacheKey(bucket, path));
    if (cached) out[path] = cached;
    else missing.push(path);
  }
  if (missing.length === 0) return out;

  const { expiresIn, expiresAtMs } = alignedExpiresIn(requestedSec);
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(missing, expiresIn);
  if (error || !data) return out;

  for (const row of data) {
    if (!row.path || !row.signedUrl || row.error) continue;
    out[row.path] = row.signedUrl;
    writeCachedSignedUrl(signedUrlCacheKey(bucket, row.path), row.signedUrl, expiresAtMs);
  }
  return out;
}

function getStorage(): Storage | null {
  if (storageOverride) return storageOverride;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
}

function readPersisted(): Map<string, CacheEntry> {
  const store = getStorage();
  if (!store) return new Map();
  try {
    const raw = store.getItem(SIGNED_URL_CACHE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return new Map();
    const now = Date.now();
    const out = new Map<string, CacheEntry>();
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const url = (value as CacheEntry).url;
      const exp = Number((value as CacheEntry).exp);
      if (typeof url !== 'string' || !url || !Number.isFinite(exp)) continue;
      if (exp - now <= SIGNED_URL_REFRESH_SKEW_MS) continue;
      out.set(key, { url, exp });
    }
    return out;
  } catch {
    return new Map();
  }
}

function persist(entries: Map<string, CacheEntry>): void {
  const store = getStorage();
  if (!store) return;
  const now = Date.now();
  const fresh = [...entries.entries()]
    .filter(([, e]) => e.exp - now > SIGNED_URL_REFRESH_SKEW_MS)
    .sort((a, b) => b[1].exp - a[1].exp)
    .slice(0, MAX_ENTRIES);
  try {
    store.setItem(
      SIGNED_URL_CACHE_KEY,
      JSON.stringify(Object.fromEntries(fresh)),
    );
  } catch {
    try {
      window.sessionStorage?.setItem(
        SIGNED_URL_CACHE_KEY,
        JSON.stringify(Object.fromEntries(fresh)),
      );
    } catch {
      /* quota / private mode */
    }
  }
}

function removePersisted(key: string): void {
  if (storageOverride) {
    storageOverride.removeItem(key);
    return;
  }
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
