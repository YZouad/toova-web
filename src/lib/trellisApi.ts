const raw = import.meta.env.VITE_TRELLIS_GENERATE_URL;

/**
 * Mesh generation endpoint.
 * - Local dev: same-origin `/api/trellis/generate` (Vite proxies the `/api/trellis`
 *   prefix to the Render BFF, which talks to EC2).
 * - Production (e.g. GitHub Pages): set `VITE_TRELLIS_GENERATE_URL` to an HTTPS URL.
 */
export const TRELLIS_GENERATE_URL =
  typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : '/api/trellis/generate';

export const trellisUsesRemoteUrl = /^https?:\/\//i.test(TRELLIS_GENERATE_URL);

export const TRELLIS_READY_TIMEOUT_MS = 10 * 60 * 1000;
export const TRELLIS_STATUS_POLL_MS = 2500;

export const TRELLIS_STARTING_STATUS = 'Starting the model instance…';

const INSUFFICIENT_SPACE_RE =
  /insufficient\s+(space|capacity)|InsufficientInstanceCapacity|not enough (space|capacity)/i;

export const TRELLIS_INSUFFICIENT_SPACE_MESSAGE =
  "There isn't enough space to start the model instance. Please try again in 5 minutes.";

function extractErrorText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim();
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
  } catch {
    /* keep the raw text */
  }
  return trimmed;
}

export function formatTrellisError(raw: string, fallback: string): string {
  const text = extractErrorText(raw);
  if (INSUFFICIENT_SPACE_RE.test(text) || INSUFFICIENT_SPACE_RE.test(raw)) {
    return TRELLIS_INSUFFICIENT_SPACE_MESSAGE;
  }
  return text || fallback;
}

export function trellisSiblingUrl(endpoint: 'wake' | 'status'): string {
  if (!TRELLIS_GENERATE_URL.endsWith('/generate')) {
    throw new Error(`Unexpected TRELLIS_GENERATE_URL: ${TRELLIS_GENERATE_URL}`);
  }

  return TRELLIS_GENERATE_URL.replace(/\/generate$/, `/${endpoint}`);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export async function ensureTrellisReady(
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<void> {
  onProgress?.(TRELLIS_STARTING_STATUS);

  const wakeRes = await fetch(trellisSiblingUrl('wake'), { method: 'POST', signal });
  if (!wakeRes.ok) {
    const text = await wakeRes.text();
    throw new Error(formatTrellisError(text, `Could not start the model instance (${wakeRes.status})`));
  }

  const deadline = Date.now() + TRELLIS_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    throwIfAborted(signal);

    const statusRes = await fetch(trellisSiblingUrl('status'), { signal });
    if (!statusRes.ok) {
      const text = await statusRes.text();
      throw new Error(formatTrellisError(text, `Could not start the model instance (${statusRes.status})`));
    }

    const body = (await statusRes.json()) as {
      ready?: boolean;
      ec2?: string;
      trellis?: string;
    };

    if (body.ready) {
      return;
    }

    onProgress?.(TRELLIS_STARTING_STATUS);
    await sleep(TRELLIS_STATUS_POLL_MS, signal);
  }

  throw new Error('Trellis did not become ready in time');
}
