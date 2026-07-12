import type { Area } from 'react-easy-crop';

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (e) => reject(e));
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

/**
 * Rasterize crop from `react-easy-crop` using a canvas (`croppedAreaPixels`).
 */
export async function cropImageToBlob(
  imageSrc: string,
  pixelCrop: Area,
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg',
  quality = 0.92,
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(pixelCrop.width);
  canvas.height = Math.round(pixelCrop.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not crop image'))),
      mimeType,
      mimeType === 'image/jpeg' ? quality : undefined,
    );
  });
}
