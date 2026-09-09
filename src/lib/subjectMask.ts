/**
 * Subject isolation (background removal) in the browser.
 *
 * The model weights are fetched from a CDN on first use, so the import is lazy —
 * nothing downloads until someone actually prepares a photo. Swapping this module
 * for a server call is the intended upgrade path if browser quality falls short;
 * `cutOutSubject` is the only seam the rest of the app knows about.
 */

/**
 * `isnet_fp16` is the quality/size middle ground (tens of MB). `isnet_quint8` is
 * roughly a quarter the download but loses thin structures like chair legs;
 * `isnet` is full precision and the largest.
 */
const MODEL = 'isnet_fp16' as const;

type BackgroundRemovalModule = typeof import('@imgly/background-removal');

let modulePromise: Promise<BackgroundRemovalModule> | null = null;

function loadModule(): Promise<BackgroundRemovalModule> {
  if (!modulePromise) {
    modulePromise = import('@imgly/background-removal');
  }
  return modulePromise;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function progressMessage(key: string, current: number, total: number): string {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  if (key.startsWith('fetch')) return `Downloading the isolation model… ${pct}%`;
  if (key.startsWith('compute')) return 'Finding the subject…';
  return 'Preparing the isolator…';
}

export interface CutOutOptions {
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

/**
 * Returns the subject on a transparent background as a PNG.
 *
 * Cancellation is cooperative: the underlying model takes no abort signal, so an
 * aborted run still finishes its inference and the result is discarded.
 */
export async function cutOutSubject(source: Blob, options: CutOutOptions = {}): Promise<Blob> {
  const { signal, onProgress } = options;

  throwIfAborted(signal);
  onProgress?.('Loading the isolator…');
  const { removeBackground } = await loadModule();
  throwIfAborted(signal);

  const cutout = await removeBackground(source, {
    model: MODEL,
    output: { format: 'image/png' },
    progress: (key, current, total) => {
      onProgress?.(progressMessage(key, current, total));
    },
  });

  throwIfAborted(signal);
  return cutout;
}
