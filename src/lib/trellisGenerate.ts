import { TRELLIS_GENERATE_URL } from './trellisApi';

function isInvalidGlbContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (!ct) return false;
  return ct.includes('text/html') || ct.includes('application/json');
}

export async function generateGlbFromPhoto(
  imageFile: File,
  signal?: AbortSignal,
): Promise<File> {
  const fd = new FormData();
  fd.append('file', imageFile);

  const res = await fetch(TRELLIS_GENERATE_URL, {
    method: 'POST',
    body: fd,
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Generation failed (${res.status})`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (isInvalidGlbContentType(contentType)) {
    throw new Error(
      contentType.includes('text/html')
        ? 'The server returned HTML instead of a 3D model. Check that VITE_TRELLIS_GENERATE_URL points at your HTTPS mesh API.'
        : 'The server returned JSON instead of a 3D model.',
    );
  }

  const blob = await res.blob();
  if (blob.size === 0) {
    throw new Error('The server returned an empty model file.');
  }

  return new File([blob], 'generated.glb', {
    type: blob.type || 'model/gltf-binary',
  });
}
