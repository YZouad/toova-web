/**
 * Draw numbered face/gap marks onto a canvas for the vision overlay.
 * Browser-only (uses CanvasRenderingContext2D).
 */

export interface MarkPoint {
  id: string;
  cx: number;
  cy: number;
  label?: string;
}

export function drawNumberedMarks(
  ctx: CanvasRenderingContext2D,
  faces: MarkPoint[],
  gaps: MarkPoint[],
): void {
  const drawBadge = (m: MarkPoint, color: string, prefix: string) => {
    const r = 14;
    ctx.beginPath();
    ctx.arc(m.cx, m.cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = m.label ?? m.id.replace(/^[a-z]+-?/i, prefix);
    ctx.fillText(text, m.cx, m.cy);
  };

  faces.forEach((f, i) => drawBadge({ ...f, label: String(i + 1) }, '#2b6cb0', ''));
  gaps.forEach((g, i) => drawBadge({ ...g, label: `G${i + 1}` }, '#c05621', 'G'));
}

/** Composite original image + marks into a JPEG data URL (longest edge ≤ maxEdge). */
export async function renderMarkedOverlayDataUrl(
  imageUrl: string,
  faces: MarkPoint[],
  gaps: MarkPoint[],
  maxEdge = 1568,
): Promise<string> {
  const img = await loadImage(imageUrl);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context');
  ctx.drawImage(img, 0, 0, w, h);
  const sx = w / img.width;
  const sy = h / img.height;
  drawNumberedMarks(
    ctx,
    faces.map((f) => ({ ...f, cx: f.cx * sx, cy: f.cy * sy })),
    gaps.map((g) => ({ ...g, cx: g.cx * sx, cy: g.cy * sy })),
  );
  return canvas.toDataURL('image/jpeg', 0.85);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load floor plan image'));
    img.src = url;
  });
}
