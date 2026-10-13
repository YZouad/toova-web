import {
  newGenerationRef,
  trellisAuthHeaders,
  TrellisInsufficientCreditsError,
} from './trellisAuth';
import { ensureTrellisReady, formatTrellisError, TRELLIS_GENERATE_URL } from './trellisApi';
import { ensureJpegForTrellis } from './webpToJpeg';

function isInvalidGlbContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (!ct) return false;
  return ct.includes('text/html') || ct.includes('application/json');
}

export async function generateGlbFromPhoto(
  imageFile: File,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<File> {
  await ensureTrellisReady(signal, onProgress);

  const file = await ensureJpegForTrellis(imageFile);
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  onProgress?.('Generating 3D model…');

  const fd = new FormData();
  fd.append('file', file);

  const generationRef = newGenerationRef();
  const authHeaders = await trellisAuthHeaders(generationRef);

  const res = await fetch(TRELLIS_GENERATE_URL, {
    method: 'POST',
    body: fd,
    signal,
    headers: authHeaders,
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 402) {
      try {
        const parsed = JSON.parse(errText) as {
          error?: string;
          cost?: number;
          monthly_balance?: number;
          purchased_balance?: number;
        };
        throw new TrellisInsufficientCreditsError(
          'You need more credits to generate a model.',
          {
            cost: parsed.cost,
            monthlyBalance: parsed.monthly_balance,
            purchasedBalance: parsed.purchased_balance,
          },
        );
      } catch (err) {
        if (err instanceof TrellisInsufficientCreditsError) throw err;
        throw new TrellisInsufficientCreditsError('You need more credits to generate a model.');
      }
    }
    if (res.status === 503) {
      try {
        const parsed = JSON.parse(errText) as { message?: string; error?: string };
        throw new Error(
          formatTrellisError(parsed.message || parsed.error || '', 'The model instance is not ready yet.'),
        );
      } catch (err) {
        if (err instanceof SyntaxError) {
          throw new Error(formatTrellisError(errText, 'The model instance is not ready yet.'));
        }
        throw err;
      }
    }
    throw new Error(formatTrellisError(errText, `Generation failed (${res.status})`));
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (isInvalidGlbContentType(contentType)) {
    throw new Error(
      contentType.includes('text/html')
        ? 'The server returned HTML instead of a 3D model. Check that VITE_TRELLIS_GENERATE_URL points at your HTTPS mesh API.'
        : 'The server returned JSON instead of a 3D model.',
    );
  }

  onProgress?.('Downloading model…');
  const blob = await res.blob();
  if (blob.size === 0) {
    throw new Error('The server returned an empty model file.');
  }

  return new File([blob], 'generated.glb', {
    type: blob.type || 'model/gltf-binary',
  });
}
