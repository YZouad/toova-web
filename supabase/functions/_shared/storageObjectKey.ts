/**
 * Private-bucket object keys are `{userId}/{segment}/…`.
 * Dot segments are rejected so a storage URL cannot climb out of its bucket.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENT_RE = /^[A-Za-z0-9._-]{1,200}$/;

function segments(path: string): string[] | null {
  const raw = path.trim();
  if (!raw || raw.length > 1024) return null;
  if (raw.includes('\\') || raw.includes('\0')) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  if (raw.startsWith('/') || raw.endsWith('/')) return null;
  if (raw.includes('://') || /^blob:/i.test(raw)) return null;
  const parts = raw.split('/');
  if (parts.length < 2) return null;
  for (const seg of parts) {
    if (!SEGMENT_RE.test(seg) || seg === '.' || seg === '..') return null;
  }
  return parts;
}

/** True for a private-bucket key whose first folder is a user id. */
export function isCanonicalStorageKey(path: string | null | undefined): boolean {
  if (!path) return false;
  const parts = segments(path);
  if (!parts) return false;
  return UUID_RE.test(parts[0]);
}

/** True when the key is canonical and the first folder is `ownerId`. */
export function isOwnedStorageKey(
  path: string | null | undefined,
  ownerId: string | null | undefined,
): boolean {
  if (!path || !ownerId) return false;
  const parts = segments(path);
  if (!parts || !UUID_RE.test(parts[0])) return false;
  return parts[0].toLowerCase() === ownerId.trim().toLowerCase();
}

/**
 * Percent-encode a canonical key for a storage URL.
 * Returns null for anything that could resolve `..` out of the bucket.
 */
export function encodeCanonicalStorageKey(path: string | null | undefined): string | null {
  if (!isCanonicalStorageKey(path)) return null;
  return path!
    .trim()
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}
