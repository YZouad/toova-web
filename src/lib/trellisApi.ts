const raw = import.meta.env.VITE_TRELLIS_GENERATE_URL;

/**
 * Mesh generation endpoint.
 * - Local dev: same-origin `/api/trellis/generate` (Vite or Express proxy).
 * - Production (e.g. GitHub Pages): set `VITE_TRELLIS_GENERATE_URL` to an HTTPS URL
 *   (direct Trellis with TLS + CORS, or this repo's Express BFF deployed behind HTTPS).
 */
export const TRELLIS_GENERATE_URL =
  typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : '/api/trellis/generate';

export const trellisUsesRemoteUrl = /^https?:\/\//i.test(TRELLIS_GENERATE_URL);
