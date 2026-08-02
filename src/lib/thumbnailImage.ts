/** Resize an image blob/file to a JPEG palette thumbnail (~512px max side). */
export async function imageToJpegThumbnail(
  source: Blob | File,
  maxPx = 512,
): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height, 1));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.fillStyle = '#E9DFCC';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
    });
  } catch {
    return null;
  }
}
