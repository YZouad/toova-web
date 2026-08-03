/** Build and parse shareable room URLs. */

import { sharePath } from '../hooks/useRoute';

export function buildShareUrl(token: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://toova.net';
  return `${origin}${sharePath(token)}`;
}

export function parseShareTokenFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/r\/([A-Za-z0-9_-]{16,32})\/?$/);
  return m?.[1] ?? null;
}
