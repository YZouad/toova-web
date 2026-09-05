export type BrushMode = 'erase' | 'restore';

const DEFAULT_UNDO_LIMIT = 20;

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
      const i = y * width + x;
      alpha[i] = mode === 'erase' ? 0 : initialAlpha[i];
    }
  }
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
