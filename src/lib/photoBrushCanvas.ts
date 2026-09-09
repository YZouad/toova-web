import { outlineOverlayFromAlpha } from './maskContour';

/** Match canvas backing store to image pixels (safe to call every frame). */
export function ensureCanvasSize(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): void {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

/** Draw RGBA subject pixels on white — synchronous, no blob decode. */
export function drawRgbaOnWhite(
  ctx: CanvasRenderingContext2D,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const layer = ctx.createImageData(width, height);
  layer.data.set(rgba);
  ctx.putImageData(layer, 0, 0);
}

/** Draw raw RGBA pixels — for pre-isolation opaque editing. */
export function drawRgba(
  ctx: CanvasRenderingContext2D,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const layer = ctx.createImageData(width, height);
  layer.data.set(rgba);
  ctx.putImageData(layer, 0, 0);
}

/** Red boundary overlay — synchronous alternative to renderOutlinedPreview. */
export function drawOutlineOverlay(
  ctx: CanvasRenderingContext2D,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  const stroke = ctx.createImageData(width, height);
  stroke.data.set(outlineOverlayFromAlpha(rgba, width, height));
  ctx.putImageData(stroke, 0, 0);
}

/** Schedule at most one callback per animation frame. */
export function rafThrottle(fn: () => void): () => void {
  let frame = 0;
  return () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      fn();
    });
  };
}

/** Debounce a callback — useful for exporting blobs after editing pauses. */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
