const JPEG_QUALITY = 0.92;

export function isWebpImageFile(file: File): boolean {
  if (file.type.toLowerCase() === 'image/webp') return true;
  return file.name.toLowerCase().endsWith('.webp');
}

/** Re-encode a WebP file as JPEG. Other images are returned unchanged. */
export async function ensureJpegForTrellis(file: File): Promise<File> {
  if (!isWebpImageFile(file)) return file;
  const jpeg = await rasterizeToJpeg(file);
  const stem = file.name.replace(/\.[^/.]+$/, '') || 'photo';
  return new File([jpeg], `${stem}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

async function rasterizeToJpeg(source: Blob): Promise<Blob> {
  try {
    return await rasterizeBitmapToJpeg(source);
  } catch {
    return await rasterizeImageElementToJpeg(source);
  }
}

async function rasterizeBitmapToJpeg(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    return canvasToJpeg(bitmap.width, bitmap.height, (ctx) => {
      ctx.drawImage(bitmap, 0, 0);
    });
  } finally {
    bitmap.close();
  }
}

function rasterizeImageElementToJpeg(source: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      void canvasToJpeg(img.naturalWidth, img.naturalHeight, (ctx) => {
        ctx.drawImage(img, 0, 0);
      }).then(resolve, reject);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not convert WebP to JPEG.'));
    };
    img.src = url;
  });
}

function canvasToJpeg(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not convert WebP to JPEG.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  draw(ctx);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Could not convert WebP to JPEG.')),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}
