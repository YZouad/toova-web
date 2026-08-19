/**
 * Cloudflare Worker: OG metadata gateway for toova.net deep links.
 * Proxies static assets from GitHub Pages; injects escaped OG tags for
 * /r/:token, /u/:handle, and /u/:handle/r/:roomId with HTTP 200.
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /** Used to fetch private share/avatar bytes for `/og/…` (never the browser). */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Public site origin used to fetch index.html (must not be a Worker-bound path). */
  SITE_ORIGIN?: string;
  /** Absolute fallback OG image URL (defaults to /toova-logo.png on SITE_ORIGIN). */
  FALLBACK_OG_IMAGE?: string;
  /** Public R2 custom domain for published room thumbnails. */
  R2_PUBLIC_BASE_URL?: string;
}

const SHARE_PATH_RE = /^\/r\/([A-Za-z0-9_-]{16,32})\/?$/;
const PROFILE_PATH_RE = /^\/u\/([a-z0-9_]{3,30})\/?$/i;
const PUBLIC_ROOM_PATH_RE =
  /^\/u\/([a-z0-9_]{3,30})\/r\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
const OG_SHARE_RE = /^\/og\/r\/([A-Za-z0-9_-]{16,32})\/?$/;
const OG_PROFILE_RE = /^\/og\/u\/([a-z0-9_]{3,30})\/?$/i;

type DeepLink =
  | { kind: 'share'; token: string }
  | { kind: 'profile'; handle: string }
  | { kind: 'publicRoom'; handle: string; roomId: string };

type OgLink = { kind: 'share'; token: string } | { kind: 'profile'; handle: string };

interface UnfurlMeta {
  title: string;
  description: string;
  imageUrl: string | null;
  canonicalUrl: string;
  cacheControl: string;
  noindex: boolean;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const og = parseOgLink(url.pathname);
    if (og && (request.method === 'GET' || request.method === 'HEAD')) {
      try {
        return await handleOgImage(request, env, og);
      } catch (err) {
        console.error('[toova-og] og image failed', redactError(err));
        return new Response('Not found', { status: 404 });
      }
    }

    const deep = parseDeepLink(url.pathname);

    if (deep && (request.method === 'GET' || request.method === 'HEAD')) {
      try {
        return await handleDeepLink(request, env, deep);
      } catch (err) {
        console.error('[toova-og] deep link failed', redactError(err));
        return proxyToOrigin(request, env);
      }
    }

    return proxyToOrigin(request, env);
  },
};

function parseDeepLink(pathname: string): DeepLink | null {
  const path = pathname.replace(/\/+$/, '') || '/';

  const room = path.match(PUBLIC_ROOM_PATH_RE);
  if (room?.[1] && room[2]) {
    return {
      kind: 'publicRoom',
      handle: room[1].toLowerCase(),
      roomId: room[2].toLowerCase(),
    };
  }

  const profile = path.match(PROFILE_PATH_RE);
  if (profile?.[1]) {
    return { kind: 'profile', handle: profile[1].toLowerCase() };
  }

  const share = path.match(SHARE_PATH_RE);
  if (share?.[1]) return { kind: 'share', token: share[1] };

  return null;
}

function parseOgLink(pathname: string): OgLink | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  const share = path.match(OG_SHARE_RE);
  if (share?.[1]) return { kind: 'share', token: share[1] };
  const profile = path.match(OG_PROFILE_RE);
  if (profile?.[1]) return { kind: 'profile', handle: profile[1].toLowerCase() };
  return null;
}

async function handleDeepLink(
  request: Request,
  env: Env,
  deep: DeepLink,
): Promise<Response> {
  const [html, meta] = await Promise.all([
    fetchOriginHtml(env),
    buildMeta(env, deep),
  ]);

  const injected = injectOgTags(html, meta);
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': meta.cacheControl,
    'x-toova-gateway': 'og',
  });

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }
  return new Response(injected, { status: 200, headers });
}

async function buildMeta(env: Env, deep: DeepLink): Promise<UnfurlMeta> {
  const fallbackImage = fallbackOgImage(env);

  if (deep.kind === 'share') {
    const data = await rpcJson(env, 'get_share_unfurl', { p_token: deep.token });
    if (!data || typeof data !== 'object') {
      return genericMeta(
        'https://toova.net/r/' + deep.token,
        fallbackImage,
        'no-store',
        true,
      );
    }
    const row = data as Record<string, unknown>;
    const title = String(row.title ?? 'Shared room');
    const owner = String(row.owner_display ?? 'Toova designer');
    const thumbPath = typeof row.thumbnail_path === 'string' ? row.thumbnail_path : null;
    const canonical =
      typeof row.canonical_url === 'string'
        ? row.canonical_url
        : 'https://toova.net/r/' + deep.token;
    const imageUrl = thumbPath
      ? `https://toova.net/og/r/${deep.token}`
      : fallbackImage;

    return {
      title: `${title} · Toova`,
      description: `Room by ${owner} on Toova`,
      imageUrl,
      canonicalUrl: canonical,
      cacheControl: 'private, no-store',
      noindex: true,
    };
  }

  if (deep.kind === 'publicRoom') {
    const data = await rpcJson(env, 'get_public_room_unfurl', {
      p_handle: deep.handle,
      p_room_id: deep.roomId,
    });
    if (!data || typeof data !== 'object') {
      return genericMeta(
        `https://toova.net/u/${deep.handle}/r/${deep.roomId}`,
        fallbackImage,
        'public, max-age=60',
        true,
      );
    }
    const row = data as Record<string, unknown>;
    const title = String(row.title ?? 'Room');
    const owner = String(row.owner_display ?? 'Toova designer');
    const thumbPath = typeof row.thumbnail_path === 'string' ? row.thumbnail_path : null;
    const canonical =
      typeof row.canonical_url === 'string'
        ? row.canonical_url
        : `https://toova.net/u/${deep.handle}/r/${deep.roomId}`;
    const imageUrl = thumbPath
      ? publicModelsObjectUrl(env, thumbPath)
      : fallbackImage;

    return {
      title: `${title} · Toova`,
      description: `Room by ${owner} on Toova`,
      imageUrl,
      canonicalUrl: canonical,
      cacheControl: 'public, max-age=60',
      noindex: true,
    };
  }

  // Profile page
  const data = await rpcJson(env, 'get_profile_page', { p_handle: deep.handle });
  if (!data || typeof data !== 'object') {
    return genericMeta(
      `https://toova.net/u/${deep.handle}`,
      fallbackImage,
      'public, max-age=60',
      true,
    );
  }
  const page = data as {
    profile?: {
      handle?: string;
      display_name?: string | null;
      bio?: string | null;
      avatar_path?: string | null;
    };
    canonical_handle?: string;
  };
  const handle = (page.canonical_handle || page.profile?.handle || deep.handle).toLowerCase();
  const display =
    (page.profile?.display_name && String(page.profile.display_name).trim()) ||
    `@${handle}`;
  const bio = (page.profile?.bio && String(page.profile.bio).trim()) || `Profile on Toova`;
  const avatarPath = page.profile?.avatar_path
    ? String(page.profile.avatar_path)
    : null;
    const imageUrl = avatarPath
      ? `https://toova.net/og/u/${handle}`
      : fallbackImage;

  return {
    title: `${display} · Toova`,
    description: bio.slice(0, 200),
    imageUrl,
    canonicalUrl: `https://toova.net/u/${handle}`,
    cacheControl: 'public, max-age=60',
    noindex: true,
  };
}

function genericMeta(
  canonicalUrl: string,
  imageUrl: string | null,
  cacheControl: string,
  noindex: boolean,
): UnfurlMeta {
  return {
    title: 'Toova',
    description: 'Design your room in 3D.',
    imageUrl,
    canonicalUrl,
    cacheControl,
    noindex,
  };
}

function siteOrigin(env: Env): string {
  return (env.SITE_ORIGIN || 'https://toova.net').replace(/\/+$/, '');
}

function fallbackOgImage(env: Env): string {
  if (env.FALLBACK_OG_IMAGE?.trim()) return env.FALLBACK_OG_IMAGE.trim();
  return `${siteOrigin(env)}/toova-logo.png`;
}

async function fetchOriginHtml(env: Env): Promise<string> {
  const res = await fetch(`${siteOrigin(env)}/index.html`, {
    headers: { accept: 'text/html' },
    cf: { cacheTtl: 60, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) {
    throw new Error(`origin index.html ${res.status}`);
  }
  return res.text();
}

async function proxyToOrigin(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    try {
      const html = await fetchOriginHtml(env);
      const headers = new Headers({
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=60',
        'x-toova-gateway': 'spa',
      });
      if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
      return new Response(html, { status: 200, headers });
    } catch (err) {
      console.error('[toova-og] spa fallback failed', redactError(err));
    }
  }
  return new Response('Not found', { status: 404 });
}

async function rpcJson(
  env: Env,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    // Opaque miss for clients; log without tokens.
    console.error('[toova-og] rpc failed', fn, res.status);
    return null;
  }
  const text = await res.text();
  if (!text || text === 'null') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function publicModelsObjectUrl(env: Env, path: string): string {
  const base = (env.R2_PUBLIC_BASE_URL || 'https://assets.toova.net').replace(
    /\/+$/,
    '',
  );
  const encoded = path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `${base}/${encoded}`;
}

async function handleOgImage(
  request: Request,
  env: Env,
  og: OgLink,
): Promise<Response> {
  let bucket = '';
  let objectPath = '';

  if (og.kind === 'share') {
    const data = await rpcJson(env, 'get_share_unfurl', { p_token: og.token });
    const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    const thumb = typeof row?.thumbnail_path === 'string' ? row.thumbnail_path.trim() : '';
    if (!thumb) return new Response('Not found', { status: 404 });
    bucket = 'room-thumbnails';
    objectPath = thumb;
  } else {
    const data = await rpcJson(env, 'get_profile_page', { p_handle: og.handle });
    const page =
      data && typeof data === 'object'
        ? (data as { profile?: { avatar_path?: string | null } })
        : null;
    const avatar = page?.profile?.avatar_path
      ? String(page.profile.avatar_path).trim()
      : '';
    if (!avatar) return new Response('Not found', { status: 404 });
    bucket = 'profile-avatars';
    objectPath = avatar;
  }

  const object = await fetchStorageObject(env, bucket, objectPath);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers({
    'content-type': object.contentType,
    'cache-control': 'public, max-age=300',
    'x-toova-gateway': 'og-image',
  });
  if (request.method === 'HEAD') {
    headers.set('content-length', String(object.body.byteLength));
    return new Response(null, { status: 200, headers });
  }
  return new Response(object.body, { status: 200, headers });
}

async function fetchStorageObject(
  env: Env,
  bucket: string,
  objectPath: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  const encoded = objectPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const res = await fetch(
    `${env.SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`,
    {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
      },
    },
  );
  if (!res.ok) return null;
  return {
    body: await res.arrayBuffer(),
    contentType: res.headers.get('content-type') || 'image/jpeg',
  };
}

function injectOgTags(html: string, meta: UnfurlMeta): string {
  const tags: string[] = [
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

  // Replace existing title; strip prior OG tags we care about to avoid duplicates.
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

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function redactError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/\/r\/[A-Za-z0-9_-]{8,}/g, '/r/[redacted]');
}
