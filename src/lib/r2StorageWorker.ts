import { supabase } from './supabase';

const DEFAULT_WORKER_URL = 'https://storage.toova.net';

function workerBase(): string {
  const fromEnv = (import.meta.env.VITE_R2_STORAGE_URL as string | undefined)?.trim();
  return (fromEnv || DEFAULT_WORKER_URL).replace(/\/+$/, '');
}

export type R2IngestObject = {
  bucket: 'model-files' | 'room-thumbnails';
  path: string;
};

async function authHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token?.trim();
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function storageObjectPaths(paths: Array<string | null | undefined>): string[] {
  const unique = new Set<string>();
  for (const raw of paths) {
    const path = raw?.trim() ?? '';
    if (!path) continue;
    if (path.startsWith('http://') || path.startsWith('https://')) continue;
    if (path.startsWith('blob:')) continue;
    unique.add(path);
  }
  return [...unique];
}

/** Copy already-uploaded Supabase objects into the public R2 bucket. */
export async function ingestPublicR2(
  objects: Array<R2IngestObject | null | undefined>,
): Promise<void> {
  const payload = objects.filter((row): row is R2IngestObject => {
    const path = row?.path?.trim() ?? '';
    return Boolean(row?.bucket && path && !path.startsWith('http') && !path.startsWith('blob:'));
  });
  if (payload.length === 0) return;

  const headers = await authHeaders();
  if (!headers) {
    console.warn('[r2] skip ingest: no session');
    return;
  }

  try {
    const res = await fetch(`${workerBase()}/v1/ingest`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ objects: payload }),
    });
    if (!res.ok) {
      console.warn('[r2] ingest failed', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.warn('[r2] ingest failed', err);
  }
}

/** Remove objects from the public R2 bucket (unpublish / delete). */
export async function unmirrorPublicR2(
  paths: Array<string | null | undefined>,
): Promise<void> {
  const unique = storageObjectPaths(paths);
  if (unique.length === 0) return;

  const headers = await authHeaders();
  if (!headers) {
    console.warn('[r2] skip unmirror: no session');
    return;
  }

  try {
    const res = await fetch(`${workerBase()}/v1/unmirror`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ paths: unique }),
    });
    if (!res.ok) {
      console.warn('[r2] unmirror failed', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.warn('[r2] unmirror failed', err);
  }
}
