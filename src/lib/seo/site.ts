/** Canonical production origin (trailing slash stripped). */
export const SITE_ORIGIN = 'https://toova.net';

/** Default Open Graph / Twitter card (1200×630). */
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og/toova-default.png`;

/** Ensure a site path uses a trailing slash (GitHub Pages serves directories this way). */
export function withTrailingSlash(path: string): string {
  if (!path || path === '/') return '/';
  const bare = path.startsWith('/') ? path : `/${path}`;
  return bare.endsWith('/') ? bare : `${bare}/`;
}

export function absoluteUrl(path: string): string {
  if (path === '/') return `${SITE_ORIGIN}/`;
  return `${SITE_ORIGIN}${withTrailingSlash(path)}`;
}
