/** Sent on HTML responses so share tokens stay off cross-site Referer headers. */
export const REFERRER_POLICY = 'strict-origin-when-cross-origin';

/**
 * Production CSP. Script sources are limited to this origin plus analytics.
 * Images stay broadly allowed because product photos come from retailer CDNs.
 * `blob:` is on connect-src because GLTFLoader fetches embedded textures with
 * fetch(), which connect-src governs. Dev servers do not send this policy
 * (Vite HMR needs eval and a websocket).
 *
 * `frame-ancestors` is header-only. Browsers ignore it in a meta tag.
 */
const CSP_DIRECTIVES = [
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' https://www.googletagmanager.com https://static.cloudflareinsights.com 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  [
    "connect-src 'self' blob:",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://assets.toova.net',
    'https://storage.toova.net',
    'https://toova-bff.onrender.com',
    'https://www.google-analytics.com',
    'https://*.google-analytics.com',
    'https://www.googletagmanager.com',
    'https://stats.g.doubleclick.net',
    'https://cloudflareinsights.com',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
  ].join(' '),
];

/** HTTP header policy. Includes frame-ancestors. */
export const CONTENT_SECURITY_POLICY = [...CSP_DIRECTIVES, "frame-ancestors 'self'"].join('; ');

/** `<meta>` policy. Same directives, without frame-ancestors. */
export const CONTENT_SECURITY_POLICY_META = CSP_DIRECTIVES.join('; ');
