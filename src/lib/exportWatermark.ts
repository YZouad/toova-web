/** Stamp a subtle Toova mark on free-tier exports. */
export async function applyExportWatermark(blob: Blob, label = 'toova.net'): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return blob;

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const pad = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * 0.02));
  const fontSize = Math.max(14, Math.round(canvas.width * 0.022));
  ctx.font = `600 ${fontSize}px "Hanken Grotesk", system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 2;
  const text = label;
  const metrics = ctx.measureText(text);
  const x = canvas.width - metrics.width - pad * 2;
  const y = canvas.height - pad;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);

  const type = blob.type || 'image/png';
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Watermark encode failed'))),
      type,
      type === 'image/jpeg' ? 0.92 : undefined,
    );
  });
}

export function clampExportDimensions(
  width: number,
  height: number,
  maxPx: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxPx) return { width, height };
  const scale = maxPx / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
