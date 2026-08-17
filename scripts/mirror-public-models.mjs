#!/usr/bin/env node
/**
 * One-time / repeatable copy of currently-public catalog + public-room assets
 * into the public-models CDN bucket.
 *
 * Usage (from repo root, CLI logged in):
 *   node scripts/mirror-public-models.mjs
 *
 * Reads the service role via `supabase projects api-keys` (not printed).
 */
import { execFileSync } from 'node:child_process';

const PROJECT_REF = 'xfifgtedssabneqlxbhf';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const DEST_BUCKET = 'public-models';

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

async function copyObject(key, sourceBucket, path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/copy`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      bucketId: sourceBucket,
      sourceKey: path,
      destinationBucket: DEST_BUCKET,
      destinationKey: path,
    }),
  });
  if (res.ok) return 'copied';
  const text = await res.text();
  if (res.status === 409 || /already exists|duplicate/i.test(text)) return 'exists';
  throw new Error(`${res.status} ${text.slice(0, 200)}`);
}

const assets = listPublicAssets();
console.log(`Mirroring ${assets.length} public assets into ${DEST_BUCKET}…`);
const key = serviceRoleKey();

let copied = 0;
let exists = 0;
let failed = 0;
for (const row of assets) {
  try {
    const result = await copyObject(key, row.bucket, row.path);
    if (result === 'copied') copied += 1;
    else exists += 1;
    console.log(`  ${result.padEnd(6)} ${row.bucket}  ${row.path}`);
  } catch (err) {
    failed += 1;
    console.warn(`  FAIL   ${row.bucket}  ${row.path}  ${err.message}`);
  }
}

console.log(`Done. copied=${copied} already=${exists} failed=${failed}`);
