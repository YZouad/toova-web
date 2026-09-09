/**
 * Pixel math for reading a subject cutout's alpha channel: where the subject
 * sits, and where its boundary runs. Pure functions over RGBA buffers so they
 * stay testable without a canvas.
 *
 * The red review outline comes from these boundaries, not from an intensity
 * edge detector — we want the edge of the *subject*, not every edge in the photo.
 */

/** Alpha at or above this counts as subject. Below it is background. */
export const ALPHA_THRESHOLD = 16;

export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OutlineOptions {
  threshold?: number;
  /** Stroke width in pixels. Odd values center on the boundary. */
  thickness?: number;
  color?: readonly [number, number, number];
}

function alphaAt(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  return data[(y * width + x) * 4 + 3];
}

/** Tight box around every pixel at or above `threshold`, or null if nothing is opaque. */
export function alphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = ALPHA_THRESHOLD,
): PixelBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(data, width, x, y) < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Grow `bounds` by a share of its longer edge, clamped to the image. Trellis reads
 * a subject better with a little breathing room than cropped flush to the pixel.
 */
export function padBounds(
  bounds: PixelBounds,
  width: number,
  height: number,
  padRatio: number,
): PixelBounds {
  const pad = Math.round(Math.max(bounds.width, bounds.height) * Math.max(0, padRatio));
  const x = Math.max(0, bounds.x - pad);
  const y = Math.max(0, bounds.y - pad);
  const right = Math.min(width, bounds.x + bounds.width + pad);
  const bottom = Math.min(height, bounds.y + bounds.height + pad);
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

/** Share of pixels the isolator kept, 0–1. Near zero means it found no subject. */
export function opaqueFraction(
  data: Uint8ClampedArray,
  threshold = ALPHA_THRESHOLD,
): number {
  const total = data.length / 4;
  if (total <= 0) return 0;
  let kept = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] >= threshold) kept += 1;
  }
  return kept / total;
}

/**
 * RGBA overlay containing only the subject's boundary, stroked in `color`.
 * Everything else is fully transparent, so it composites straight over a preview.
 *
 * Pixels outside the image count as background, so a subject running off the
 * frame gets outlined along the cut — that is real feedback, not a glitch.
 */
export function outlineOverlayFromAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: OutlineOptions = {},
): Uint8ClampedArray {
  const threshold = options.threshold ?? ALPHA_THRESHOLD;
  const thickness = Math.max(1, Math.round(options.thickness ?? 3));
  const [red, green, blue] = options.color ?? [255, 59, 48];
  const out = new Uint8ClampedArray(width * height * 4);
  const radius = Math.floor((thickness - 1) / 2);

  const opaque = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return alphaAt(data, width, x, y) >= threshold;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!opaque(x, y)) continue;
      const onBoundary =
        !opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1);
      if (!onBoundary) continue;

      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          const i = (py * width + px) * 4;
          out[i] = red;
          out[i + 1] = green;
          out[i + 2] = blue;
          out[i + 3] = 255;
        }
      }
    }
  }

  return out;
}
