/**
 * Copies public catalog/room objects from Supabase Storage into R2 (toova-public).
 * Used by the app after publish, and by the one-shot backfill script via wrangler.
 */

export interface Env {
  PUBLIC_BUCKET: R2Bucket;
  PRIVATE_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const ALLOWED_ORIGINS = new Set([
  'https://toova.net',
  'https://www.toova.net',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const ALLOWED_BUCKETS = new Set(['model-files', 'room-thumbnails']);
const MAX_OBJECTS = 40;

type IngestObject = { bucket: string; path: string };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/v1/ingest') {
        return withCors(origin, await ingest(request, env));
      }
      if (request.method === 'POST' && url.pathname === '/v1/unmirror') {
        return withCors(origin, await unmirror(request, env));
      }
      return withCors(origin, json({ error: 'Not found' }, 404));
    } catch (err) {
      if (err instanceof HttpError) {
        return withCors(origin, json({ error: err.message }, err.status));
      }
      const message = err instanceof Error ? err.message : 'Worker error';
      return withCors(origin, json({ error: message }, 500));
    }
  },
};

async function ingest(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await request.json().catch(() => null);
  const objects = parseIngestObjects(body);
  if (!objects) return json({ error: 'Invalid objects' }, 400);

  const results: Array<{ path: string; status: string }> = [];
  for (const row of objects) {
    if (!ownsPath(user.id, row.path)) {
      results.push({ path: row.path, status: 'forbidden' });
      continue;
    }
    try {
      await copySupabaseToR2(env, row.bucket, row.path);
      results.push({ path: row.path, status: 'ok' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'copy failed';
      results.push({ path: row.path, status: message });
    }
  }
  return json({ results });
}

async function unmirror(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await request.json().catch(() => null);
  const paths = parsePaths(body);
  if (!paths) return json({ error: 'Invalid paths' }, 400);

  const toDelete: string[] = [];
  for (const path of paths) {
    if (!ownsPath(user.id, path)) continue;
    toDelete.push(path);
  }
  if (toDelete.length > 0) await env.PUBLIC_BUCKET.delete(toDelete);
  return json({ deleted: toDelete.length });
}

async function copySupabaseToR2(env: Env, bucket: string, path: string): Promise<void> {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!res.ok) {
    throw new Error(`supabase ${res.status}`);
  }

  await env.PUBLIC_BUCKET.put(path, res.body, {
    httpMetadata: {
      contentType: res.headers.get('content-type') || contentTypeFor(path),
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });
}

async function requireUser(
  request: Request,
  env: Env,
): Promise<{ id: string }> {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Missing Authorization');

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new HttpError(401, 'Invalid session');
  const data = (await res.json()) as { id?: string };
  if (!data?.id) throw new HttpError(401, 'Invalid session');
  return { id: data.id };
}

function ownsPath(userId: string, path: string): boolean {
  const folder = path.split('/').find(Boolean);
  return folder === userId;
}

function parseIngestObjects(body: unknown): IngestObject[] | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as { objects?: unknown }).objects;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_OBJECTS) return null;
  const out: IngestObject[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null;
    const bucket = String((row as IngestObject).bucket || '').trim();
    const path = String((row as IngestObject).path || '').trim();
    if (!ALLOWED_BUCKETS.has(bucket) || !path || path.includes('..')) return null;
    out.push({ bucket, path });
  }
  return out;
}

function parsePaths(body: unknown): string[] | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as { paths?: unknown }).paths;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_OBJECTS) return null;
  const out: string[] = [];
  for (const row of raw) {
    const path = String(row || '').trim();
    if (!path || path.includes('..')) return null;
    out.push(path);
  }
  return out;
}

function contentTypeFor(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.glb')) return 'model/gltf-binary';
  if (lower.endsWith('.gltf')) return 'model/gltf+json';
  if (lower.endsWith('.usdz')) return 'model/vnd.usdz+zip';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type',
  );
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

function withCors(origin: string | null, response: Response): Response {
  const headers = corsHeaders(origin);
  for (const [key, value] of headers.entries()) {
    response.headers.set(key, value);
  }
  return response;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
