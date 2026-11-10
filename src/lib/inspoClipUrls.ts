export type InspoClipPlatform = 'instagram' | 'tiktok';

export type InspoClipStatus = 'pending' | 'published' | 'rejected';

export interface ChecklistInspoClip {
  id: string;
  categoryId: string;
  productId: string | null;
  platform: InspoClipPlatform;
  canonicalUrl: string;
  title: string;
  creatorHandle: string | null;
  thumbnailUrl: string | null;
  status: InspoClipStatus;
  submittedBy: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export type ParsedInspoClipUrl =
  | {
      ok: true;
      platform: InspoClipPlatform;
      canonicalUrl: string;
      inferredCreatorHandle: string | null;
    }
  | { ok: false; error: string };

const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
]);

const TIKTOK_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
]);

function normalizeHandle(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim().replace(/^@+/, '');
  if (!trimmed) return null;
  return `@${trimmed}`;
}

/**
 * Validate and normalize an Instagram Reel/Post or TikTok video URL.
 * Rejects non-allowlisted domains and strips tracking query params.
 */
export function parseInspoClipUrl(rawUrl: string): ParsedInspoClipUrl {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: 'Paste an Instagram Reel or TikTok link.' };
  }

  let url: URL;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    url = new URL(withProto);
  } catch {
    return { ok: false, error: 'Enter a valid URL.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Enter a valid http or https link.' };
  }

  const host = url.hostname.toLowerCase();
  const segments = url.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  if (INSTAGRAM_HOSTS.has(host)) {
    // Support /reel/:code, /reels/:code, /p/:code, or /:handle/reel/:code
    let kindIdx = segments.findIndex((s) => {
      const lower = s.toLowerCase();
      return lower === 'reel' || lower === 'reels' || lower === 'p';
    });
    if (kindIdx < 0 || !segments[kindIdx + 1]) {
      return {
        ok: false,
        error: 'Use a direct Instagram Reel or post link (e.g. instagram.com/reel/...).',
      };
    }
    const code = segments[kindIdx + 1]!;
    const rawKind = segments[kindIdx]!.toLowerCase();
    const canonicalKind = rawKind === 'p' ? 'p' : 'reel';
    const handleCandidate = kindIdx === 1 ? segments[0] : null;
    return {
      ok: true,
      platform: 'instagram',
      canonicalUrl: `https://www.instagram.com/${canonicalKind}/${code}/`,
      inferredCreatorHandle: normalizeHandle(handleCandidate),
    };
  }

  if (TIKTOK_HOSTS.has(host)) {
    if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
      if (!segments[0]) {
        return { ok: false, error: 'Use a direct TikTok video link.' };
      }
      return {
        ok: true,
        platform: 'tiktok',
        canonicalUrl: `https://${host}/${segments[0]}/`,
        inferredCreatorHandle: null,
      };
    }

    // Standard: /@user/video/123456 or /t/CODE
    if (segments[0]?.toLowerCase() === 't' && segments[1]) {
      return {
        ok: true,
        platform: 'tiktok',
        canonicalUrl: `https://www.tiktok.com/t/${segments[1]}/`,
        inferredCreatorHandle: null,
      };
    }

    const userSeg = segments.find((s) => s.startsWith('@')) ?? null;
    const videoIdx = segments.findIndex((s) => s.toLowerCase() === 'video' || s.toLowerCase() === 'photo');
    if (videoIdx >= 0 && segments[videoIdx + 1]) {
      const videoId = segments[videoIdx + 1]!;
      const kind = segments[videoIdx]!.toLowerCase();
      const handlePath = userSeg ?? '@tiktok';
      return {
        ok: true,
        platform: 'tiktok',
        canonicalUrl: `https://www.tiktok.com/${handlePath}/${kind}/${videoId}`,
        inferredCreatorHandle: normalizeHandle(userSeg),
      };
    }

    return {
      ok: false,
      error: 'Use a direct TikTok video link (e.g. tiktok.com/@creator/video/...).',
    };
  }

  return {
    ok: false,
    error: 'Only Instagram Reels and TikTok links are supported right now.',
  };
}

export function inspoPlatformLabel(platform: InspoClipPlatform): string {
  return platform === 'instagram' ? 'IG Reel' : 'TikTok';
}

/** Opens TikTok video search for this checklist category (external — not an in-app feed). */
export function tiktokBrowseUrlForCategory(categoryName: string): string {
  const q = encodeURIComponent(`college dorm ${categoryName.toLowerCase()}`);
  return `https://www.tiktok.com/search/video?q=${q}`;
}

/** Tag explore on Instagram — best-effort discovery; no guaranteed reel results. */
export function instagramBrowseUrlForCategory(categoryName: string): string {
  const slug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const tag = slug ? `dorm${slug}` : 'dormroom';
  return `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;
}
