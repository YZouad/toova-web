#!/usr/bin/env node
/**
 * Post-build: write static OG HTML (+ baked og.jpg) into dist/ for GitHub Pages.
 *
 * Env (CI):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SITE_ORIGIN (optional, default https://toova.net)
 *   DIST_DIR (optional, default dist)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://toova.net').replace(/\/+$/, '');
const DIST_DIR = resolve(ROOT, process.env.DIST_DIR || 'dist');
const FALLBACK_OG = `${SITE_ORIGIN}/toova-logo.png`;

const ROOM_THUMBS = 'room-thumbnails';
const PROFILE_AVATARS = 'profile-avatars';

main().catch((err) => {
  console.error('[generate-static-unfurls]', err);
  process.exit(1);
});

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const shellPath = join(DIST_DIR, 'index.html');
  const shellHtml = await readFile(shellPath, 'utf8');

  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
  };

  const [shareTokens, publicProfiles, publicRooms] = await Promise.all([
    listActiveShareTokens(supabaseUrl, headers),
    listPublicProfiles(supabaseUrl, headers),
    listPublicRooms(supabaseUrl, headers),
  ]);

  console.log(
    `[generate-static-unfurls] shares=${shareTokens.length} profiles=${publicProfiles.length} rooms=${publicRooms.length}`,
  );

  let written = 0;

  for (const token of shareTokens) {
    const data = await rpcJson(supabaseUrl, headers, 'get_share_unfurl', {
      p_token: token,
    });
    const relDir = `r/${token}`;
    const meta = shareMeta(token, data);
    await writeUnfurl(supabaseUrl, headers, shellHtml, relDir, meta, ROOM_THUMBS);
    written += 1;
  }

  for (const profile of publicProfiles) {
    const handle = String(profile.handle || '').toLowerCase();
    if (!handle) continue;
    const data = await rpcJson(supabaseUrl, headers, 'get_profile_page', {
      p_handle: handle,
    });
    const meta = profileMeta(handle, data, profile);
    const relDir = `u/${handle}`;
    await writeUnfurl(supabaseUrl, headers, shellHtml, relDir, meta, PROFILE_AVATARS);
    written += 1;
  }

  for (const room of publicRooms) {
    const handle = String(room.handle || '').toLowerCase();
    const roomId = String(room.id || '').toLowerCase();
    if (!handle || !roomId) continue;
    const data = await rpcJson(supabaseUrl, headers, 'get_public_room_unfurl', {
      p_handle: handle,
      p_room_id: roomId,
    });
    const meta = publicRoomMeta(handle, roomId, data);
    const relDir = `u/${handle}/r/${roomId}`;
    await writeUnfurl(supabaseUrl, headers, shellHtml, relDir, meta, ROOM_THUMBS);
    written += 1;
  }

  console.log(`[generate-static-unfurls] wrote ${written} pages under ${DIST_DIR}`);
}

async function writeUnfurl(supabaseUrl, headers, shellHtml, relDir, meta, bucket) {
  const outDir = join(DIST_DIR, relDir);
  await mkdir(outDir, { recursive: true });

  let imageUrl = FALLBACK_OG;
  if (meta.storagePath) {
    const ok = await downloadStorageObject(
      supabaseUrl,
      headers,
      bucket,
      meta.storagePath,
      join(outDir, 'og.jpg'),
    );
    if (ok) {
      imageUrl = `${SITE_ORIGIN}/${relDir}/og.jpg`;
    }
  }

  const html = injectOgTags(shellHtml, {
    title: meta.title,
    description: meta.description,
    canonicalUrl: meta.canonicalUrl,
    imageUrl,
    noindex: true,
  });
  await writeFile(join(outDir, 'index.html'), html, 'utf8');
}

function shareMeta(token, data) {
  const canonical = `${SITE_ORIGIN}/r/${token}`;
  if (!data || typeof data !== 'object') {
    return {
      title: 'Toova',
      description: 'Design your room in 3D.',
      canonicalUrl: canonical,
      storagePath: null,
    };
  }
  const row = data;
  const title = String(row.title ?? 'Shared room');
  const owner = String(row.owner_display ?? 'Toova designer');
  return {
    title: `${title} · Toova`,
    description: `Room by ${owner} on Toova`,
    canonicalUrl:
      typeof row.canonical_url === 'string' ? row.canonical_url : canonical,
    storagePath: typeof row.thumbnail_path === 'string' ? row.thumbnail_path : null,
  };
}

function profileMeta(handle, data, fallback) {
  const canonical = `${SITE_ORIGIN}/u/${handle}`;
  if (data && typeof data === 'object') {
    const page = data;
    const canonHandle = (
      page.canonical_handle ||
      page.profile?.handle ||
      handle
    ).toLowerCase();
    const display =
      (page.profile?.display_name && String(page.profile.display_name).trim()) ||
      `@${canonHandle}`;
    const bio =
      (page.profile?.bio && String(page.profile.bio).trim()) || 'Profile on Toova';
    const avatarPath = page.profile?.avatar_path
      ? String(page.profile.avatar_path)
      : null;
    return {
      title: `${display} · Toova`,
      description: bio.slice(0, 200),
      canonicalUrl: `${SITE_ORIGIN}/u/${canonHandle}`,
      storagePath: avatarPath,
    };
  }
  const display =
    (fallback.display_name && String(fallback.display_name).trim()) ||
    `@${handle}`;
  const bio =
    (fallback.bio && String(fallback.bio).trim()) || 'Profile on Toova';
  return {
    title: `${display} · Toova`,
    description: bio.slice(0, 200),
    canonicalUrl: canonical,
    storagePath:
      typeof fallback.avatar_path === 'string' ? fallback.avatar_path : null,
  };
}

function publicRoomMeta(handle, roomId, data) {
  const canonical = `${SITE_ORIGIN}/u/${handle}/r/${roomId}`;
  if (!data || typeof data !== 'object') {
    return {
      title: 'Toova',
      description: 'Design your room in 3D.',
      canonicalUrl: canonical,
      storagePath: null,
    };
  }
  const row = data;
  const title = String(row.title ?? 'Room');
  const owner = String(row.owner_display ?? 'Toova designer');
  return {
    title: `${title} · Toova`,
    description: `Room by ${owner} on Toova`,
    canonicalUrl:
      typeof row.canonical_url === 'string' ? row.canonical_url : canonical,
    storagePath: typeof row.thumbnail_path === 'string' ? row.thumbnail_path : null,
  };
}

async function listActiveShareTokens(supabaseUrl, headers) {
  const rows = await restJson(
    `${supabaseUrl}/rest/v1/room_shares?select=token,expires_at&revoked_at=is.null`,
    headers,
  );
  if (!Array.isArray(rows)) return [];
  const now = Date.now();
  return rows
    .filter((r) => {
      if (r.expires_at == null) return true;
      const t = Date.parse(String(r.expires_at));
      return Number.isFinite(t) && t > now;
    })
    .map((r) => (typeof r.token === 'string' ? r.token : ''))
    .filter((t) => /^[A-Za-z0-9_-]{16,32}$/.test(t));
}

async function listPublicProfiles(supabaseUrl, headers) {
  const url =
    `${supabaseUrl}/rest/v1/profiles` +
    `?select=handle,display_name,bio,avatar_path` +
    `&is_public=eq.true`;
  const rows = await restJson(url, headers);
  return Array.isArray(rows) ? rows : [];
}

async function listPublicRooms(supabaseUrl, headers) {
  // rooms.user_id → auth.users (not profiles FK); join handles in JS.
  const rooms = await restJson(
    `${supabaseUrl}/rest/v1/rooms?select=id,name,thumbnail_path,user_id&visibility=eq.public`,
    headers,
  );
  if (!Array.isArray(rooms) || rooms.length === 0) return [];

  const userIds = [
    ...new Set(
      rooms
        .map((r) => (typeof r.user_id === 'string' ? r.user_id : ''))
        .filter(Boolean),
    ),
  ];
  if (userIds.length === 0) return [];

  const profiles = await restJson(
    `${supabaseUrl}/rest/v1/profiles` +
      `?select=id,handle` +
      `&is_public=eq.true` +
      `&id=in.(${userIds.join(',')})`,
    headers,
  );
  const handleByUser = new Map();
  if (Array.isArray(profiles)) {
    for (const p of profiles) {
      if (typeof p.id === 'string' && typeof p.handle === 'string') {
        handleByUser.set(p.id, p.handle.toLowerCase());
      }
    }
  }

  return rooms
    .map((r) => ({
      id: r.id,
      handle: handleByUser.get(r.user_id) ?? null,
      name: r.name,
      thumbnail_path: r.thumbnail_path,
    }))
    .filter((r) => r.id && r.handle);
}

async function rpcJson(supabaseUrl, headers, fn, args) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...headers, prefer: 'return=representation' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    console.error(`[generate-static-unfurls] rpc ${fn} failed`, res.status);
    return null;
  }
  const text = await res.text();
  if (!text || text === 'null') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function restJson(url, headers) {
  const res = await fetch(url, {
    headers: { ...headers, accept: 'application/json' },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`REST ${res.status}: ${url} ${detail.slice(0, 200)}`);
  }
  return res.json();
}

async function downloadStorageObject(supabaseUrl, headers, bucket, objectPath, destPath) {
  const trimmed = objectPath.trim();
  if (!trimmed) return false;
  const encoded = trimmed.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/${bucket}/${encoded}`,
    { headers: { authorization: headers.authorization, apikey: headers.apikey } },
  );
  if (!res.ok) {
    console.warn(
      `[generate-static-unfurls] skip image ${bucket}/${trimmed} (${res.status})`,
    );
    return false;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  return true;
}

function injectOgTags(html, meta) {
  const tags = [
    `<link rel="canonical" href="${escapeAttr(meta.canonicalUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Toova" />`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:url" content="${escapeAttr(meta.canonicalUrl)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
  ];

  if (meta.imageUrl) {
    tags.push(
      `<meta property="og:image" content="${escapeAttr(meta.imageUrl)}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:image" content="${escapeAttr(meta.imageUrl)}" />`,
    );
  }

  if (meta.noindex) {
    tags.push(`<meta name="robots" content="noindex,nofollow" />`);
  }

  tags.push(`<title>${escapeHtml(meta.title)}</title>`);
  const block = tags.join('\n    ');

  let out = html.replace(/<title>[^<]*<\/title>/i, '');
  out = out.replace(
    /<meta\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+|robots)["'][^>]*>/gi,
    '',
  );
  out = out.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');

  if (/<\/head>/i.test(out)) {
    return out.replace(/<\/head>/i, `    ${block}\n  </head>`);
  }
  return `${block}\n${out}`;
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}
