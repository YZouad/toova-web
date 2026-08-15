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
  onProgress?.('Waking Trellis…');
  const wakeRes = await fetch(trellisSiblingUrl('wake'), { method: 'POST', signal });
  if (!wakeRes.ok) {
    const text = await wakeRes.text();
    throw new Error(text || `Trellis wake failed (${wakeRes.status})`);
  }

  const deadline = Date.now() + TRELLIS_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    throwIfAborted(signal);

    const statusRes = await fetch(trellisSiblingUrl('status'), { signal });
    if (!statusRes.ok) {
      const text = await statusRes.text();
      throw new Error(text || `Trellis status failed (${statusRes.status})`);
    }

    const body = (await statusRes.json()) as {
      ready?: boolean;
      ec2?: string;
      trellis?: string;
    };

    if (body.ready) {
      return;
    }

    onProgress?.(`Starting Trellis… (${body.ec2 ?? 'unknown'}, ${body.trellis ?? 'unknown'})`);
    await sleep(TRELLIS_STATUS_POLL_MS, signal);
  }

  throw new Error('Trellis did not become ready in time');
}
