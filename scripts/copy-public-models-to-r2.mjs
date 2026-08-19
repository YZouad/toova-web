#!/usr/bin/env node
/**
 * Copy currently-public catalog + public-room assets from Supabase Storage
 * into the R2 bucket `toova-public` (https://assets.toova.net/{path}).
 *
 * Usage (from repo root, Wrangler + Supabase CLI logged in):
 *   node scripts/copy-public-models-to-r2.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT_REF = 'xfifgtedssabneqlxbhf';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const R2_BUCKET = 'toova-public';

const LIST_SQL = `
select distinct path, bucket from (
  select nullif(trim(model_url), '') as path, 'model-files'::text as bucket
  from furniture_catalog where visibility = 'public'
  union
  select nullif(trim(thumbnail_path), ''), 'model-files'
  from furniture_catalog where visibility = 'public'
  union
  select nullif(trim(usdz_path), ''), 'model-files'
  from furniture_catalog where visibility = 'public'
  union
  select nullif(trim(silhouette_path), ''), 'model-files'
  from furniture_catalog where visibility = 'public'
  union
  select nullif(trim(ri.model_url), ''), 'model-files'
  from room_items ri
  join rooms r on r.id = ri.room_id
  join profiles p on p.id = r.user_id
  where r.visibility = 'public' and p.is_public
  union
  select nullif(trim(ri.blanket_texture_path), ''), 'model-files'
  from room_items ri
  join rooms r on r.id = ri.room_id
  join profiles p on p.id = r.user_id
  where r.visibility = 'public' and p.is_public
  union
  select nullif(trim(r.thumbnail_path), ''), 'room-thumbnails'
  from rooms r
  join profiles p on p.id = r.user_id
  where r.visibility = 'public' and p.is_public
) x
where path is not null
  and path !~* '^https?://'
  and path !~* '^blob:'
  and path !~* '^checklist-refs/'
  and path !~* '^marketing/';
`;

function runJson(cmd, args) {
  const raw = execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(raw);
}

function serviceRoleKey() {
  const keys = runJson('supabase', [
    'projects',
    'api-keys',
    '--project-ref',
    PROJECT_REF,
    '-o',
    'json',
  ]);
  const list = Array.isArray(keys) ? keys : keys?.keys ?? keys?.api_keys ?? [];
  const row = list.find((k) => k.name === 'service_role' || k.role === 'service_role');
  const key = row?.api_key || row?.key || row?.secret;
  if (!key) {
    throw new Error('Could not find service_role key from supabase CLI');
  }
  return key;
}

function listPublicAssets() {
  const payload = runJson('supabase', ['db', 'query', '--linked', '-o', 'json', LIST_SQL]);
  const rows = Array.isArray(payload) ? payload : payload.rows ?? [];
  return rows.filter((r) => r?.path && r?.bucket);
}

function contentTypeFor(path) {
  const lower = String(path).toLowerCase();
  if (lower.endsWith('.glb')) return 'model/gltf-binary';
  if (lower.endsWith('.gltf')) return 'model/gltf+json';
  if (lower.endsWith('.usdz')) return 'model/vnd.usdz+zip';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

async function downloadObject(key, bucket, path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`,
    {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text.slice(0, 180)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function wranglerPut(localFile, objectKey, contentType) {
  const wrangler = join(process.cwd(), 'worker-storage/node_modules/.bin/wrangler');
  const result = spawnSync(
    wrangler,
    [
      'r2',
      'object',
      'put',
      `${R2_BUCKET}/${objectKey}`,
      '--file',
      localFile,
      '--content-type',
      contentType,
      '--cache-control',
      'public, max-age=31536000, immutable',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'wrangler put failed').slice(0, 300));
  }
}

const assets = listPublicAssets();
console.log(`Copying ${assets.length} public assets into R2 ${R2_BUCKET}…`);
const key = serviceRoleKey();
const dir = mkdtempSync(join(tmpdir(), 'toova-r2-'));

let copied = 0;
let failed = 0;
try {
  for (const row of assets) {
    const local = join(dir, `obj-${copied}-${failed}`);
    try {
      const bytes = await downloadObject(key, row.bucket, row.path);
      writeFileSync(local, bytes);
      wranglerPut(local, row.path, contentTypeFor(row.path));
      copied += 1;
      console.log(`  ok     ${row.bucket}  ${row.path}  ${bytes.length}`);
    } catch (err) {
      failed += 1;
      console.warn(`  FAIL   ${row.bucket}  ${row.path}  ${err.message}`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`Done. copied=${copied} failed=${failed}`);
if (failed > 0) process.exitCode = 1;
