export type BrushMode = 'erase' | 'restore' | 'paint';

export type RgbColor = readonly [number, number, number];

const DEFAULT_UNDO_LIMIT = 20;
const ERASE_RGB: RgbColor = [255, 255, 255];

/** One alpha value per pixel, row-major. */
export type AlphaMask = Uint8ClampedArray;

export function copyAlphaChannel(rgba: Uint8ClampedArray): AlphaMask {
  const alpha = new Uint8ClampedArray(rgba.length / 4);
  for (let px = 0; px < alpha.length; px += 1) {
    alpha[px] = rgba[px * 4 + 3];
  }
  return alpha;
}

export function mergeAlphaIntoRgba(rgba: Uint8ClampedArray, alpha: AlphaMask): void {
  for (let px = 0; px < alpha.length; px += 1) {
    rgba[px * 4 + 3] = alpha[px];
  }
}

function paintDisk(
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  paint: (x: number, y: number, i: number) => void,
): void {
  const r2 = radius * radius;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      paint(x, y, (y * width + x) * 4);
    }
  }
}

/**
 * Paint a circular brush stroke into `alpha`. Erase clears transparency; restore
 * copies back from the model's original mask.
 */
export function applyBrushStroke(
  alpha: AlphaMask,
  initialAlpha: AlphaMask,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  mode: BrushMode,
  paintColor?: RgbColor,
): void {
  if (mode === 'paint') return;
  paintDisk(width, height, cx, cy, radius, (_x, _y, px) => {
    const i = px / 4;
    alpha[i] = mode === 'erase' ? 0 : initialAlpha[i];
  });
}

/** Pre-isolation brush on an opaque RGBA image — erase paints white, paint uses color. */
export function applyRgbBrushStroke(
  rgba: Uint8ClampedArray,
  initialRgba: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  mode: BrushMode,
  paintColor: RgbColor = [128, 128, 128],
): void {
  paintDisk(width, height, cx, cy, radius, (_x, _y, px) => {
    if (mode === 'restore') {
      rgba[px] = initialRgba[px];
      rgba[px + 1] = initialRgba[px + 1];
      rgba[px + 2] = initialRgba[px + 2];
      rgba[px + 3] = initialRgba[px + 3];
      return;
    }
    const color = mode === 'erase' ? ERASE_RGB : paintColor;
    rgba[px] = color[0];
    rgba[px + 1] = color[1];
    rgba[px + 2] = color[2];
    rgba[px + 3] = 255;
  });
}

/** Post-isolation brush on RGBA cutout — erase clears alpha, paint fills with color. */
export function applyRgbaBrushStroke(
  rgba: Uint8ClampedArray,
  initialRgba: Uint8ClampedArray,
  initialAlpha: AlphaMask,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  mode: BrushMode,
  paintColor: RgbColor = [128, 128, 128],
): void {
  paintDisk(width, height, cx, cy, radius, (_x, _y, px) => {
    const ai = px / 4;
    if (mode === 'restore') {
      rgba[px] = initialRgba[px];
      rgba[px + 1] = initialRgba[px + 1];
      rgba[px + 2] = initialRgba[px + 2];
      rgba[px + 3] = initialAlpha[ai];
      return;
    }
    if (mode === 'erase') {
      rgba[px + 3] = 0;
      return;
    }
    rgba[px] = paintColor[0];
    rgba[px + 1] = paintColor[1];
    rgba[px + 2] = paintColor[2];
    rgba[px + 3] = 255;
  });
}

/** Fixed-capacity undo stack for alpha masks. */
export class AlphaUndoStack {
  private readonly limit: number;
  private entries: AlphaMask[] = [];

  constructor(limit = DEFAULT_UNDO_LIMIT) {
    this.limit = Math.max(1, limit);
  }

  push(alpha: AlphaMask): void {
    this.entries.push(new Uint8ClampedArray(alpha));
    if (this.entries.length > this.limit) {
      this.entries.shift();
    }
  }

  pop(): AlphaMask | null {
    const last = this.entries.pop();
    return last ? new Uint8ClampedArray(last) : null;
  }

  clear(): void {
    this.entries = [];
  }

  get canUndo(): boolean {
    return this.entries.length > 0;
  }
}

/** Fixed-capacity undo stack for full RGBA buffers. */
export class RgbaUndoStack {
  private readonly limit: number;
  private entries: Uint8ClampedArray[] = [];

  constructor(limit = DEFAULT_UNDO_LIMIT) {
    this.limit = Math.max(1, limit);
  }

  push(rgba: Uint8ClampedArray): void {
    this.entries.push(new Uint8ClampedArray(rgba));
    if (this.entries.length > this.limit) {
      this.entries.shift();
    }
  }

  pop(): Uint8ClampedArray | null {
    const last = this.entries.pop();
    return last ? new Uint8ClampedArray(last) : null;
  }

  clear(): void {
    this.entries = [];
  }

  get canUndo(): boolean {
    return this.entries.length > 0;
  }
}

export function hexToRgb(hex: string): RgbColor {
  const normalized = hex.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized.padStart(6, '0').slice(0, 6);
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}
