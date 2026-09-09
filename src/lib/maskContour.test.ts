import { describe, expect, it } from 'vitest';
import {
  alphaBounds,
  opaqueFraction,
  outlineOverlayFromAlpha,
  padBounds,
} from './maskContour';

/** RGBA buffer with a constant colour and per-pixel alpha from `alphaAt`. */
function rgba(
  width: number,
  height: number,
  alphaAt: (x: number, y: number) => number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = 10;
      data[i + 1] = 20;
      data[i + 2] = 30;
      data[i + 3] = alphaAt(x, y);
    }
  }
  return data;
}

const inBox = (x: number, y: number, box: { x: number; y: number; w: number; h: number }) =>
  x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;

function alphaOf(overlay: Uint8ClampedArray, width: number, x: number, y: number): number {
  return overlay[(y * width + x) * 4 + 3];
}

describe('alphaBounds', () => {
  it('returns null when nothing is opaque', () => {
    expect(alphaBounds(rgba(4, 4, () => 0), 4, 4)).toBeNull();
  });

  it('boxes a single opaque pixel', () => {
    const data = rgba(5, 5, (x, y) => (x === 3 && y === 1 ? 255 : 0));
    expect(alphaBounds(data, 5, 5)).toEqual({ x: 3, y: 1, width: 1, height: 1 });
  });

  it('boxes an off-centre region tightly', () => {
    const box = { x: 2, y: 1, w: 3, h: 4 };
    const data = rgba(8, 8, (x, y) => (inBox(x, y, box) ? 255 : 0));
    expect(alphaBounds(data, 8, 8)).toEqual({ x: 2, y: 1, width: 3, height: 4 });
  });

  it('treats alpha below the threshold as background', () => {
    const data = rgba(4, 4, () => 8);
    expect(alphaBounds(data, 4, 4, 16)).toBeNull();
    expect(alphaBounds(data, 4, 4, 4)).toEqual({ x: 0, y: 0, width: 4, height: 4 });
  });
});

describe('padBounds', () => {
  it('grows by a share of the longer edge', () => {
    const padded = padBounds({ x: 20, y: 20, width: 10, height: 40 }, 200, 200, 0.1);
    expect(padded).toEqual({ x: 16, y: 16, width: 18, height: 48 });
  });

  it('clamps to the image instead of going negative or overflowing', () => {
    const padded = padBounds({ x: 1, y: 1, width: 8, height: 8 }, 10, 10, 0.5);
    expect(padded).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('leaves bounds alone at a zero ratio', () => {
    const bounds = { x: 3, y: 4, width: 5, height: 6 };
    expect(padBounds(bounds, 40, 40, 0)).toEqual(bounds);
  });
});

describe('opaqueFraction', () => {
  it('reports the share of kept pixels', () => {
    const data = rgba(4, 2, (x) => (x < 2 ? 255 : 0));
    expect(opaqueFraction(data)).toBeCloseTo(0.5);
  });

  it('is zero when the isolator kept nothing', () => {
    expect(opaqueFraction(rgba(3, 3, () => 0))).toBe(0);
  });
});

describe('outlineOverlayFromAlpha', () => {
  it('strokes the subject boundary and leaves the interior clear', () => {
    const box = { x: 1, y: 1, w: 4, h: 4 };
    const data = rgba(6, 6, (x, y) => (inBox(x, y, box) ? 255 : 0));
    const overlay = outlineOverlayFromAlpha(data, 6, 6, { thickness: 1 });

    expect(alphaOf(overlay, 6, 1, 1)).toBe(255);
    expect(alphaOf(overlay, 6, 2, 2)).toBe(0);
    expect(alphaOf(overlay, 6, 0, 0)).toBe(0);

    let stroked = 0;
    for (let i = 3; i < overlay.length; i += 4) {
      if (overlay[i] > 0) stroked += 1;
    }
    expect(stroked).toBe(12);
  });

  it('uses the requested colour', () => {
    const data = rgba(3, 3, (x, y) => (x === 1 && y === 1 ? 255 : 0));
    const overlay = outlineOverlayFromAlpha(data, 3, 3, {
      thickness: 1,
      color: [1, 2, 3],
    });
    const i = (1 * 3 + 1) * 4;
    expect([overlay[i], overlay[i + 1], overlay[i + 2], overlay[i + 3]]).toEqual([1, 2, 3, 255]);
  });

  it('outlines a subject that runs off the frame along the cut', () => {
    const data = rgba(4, 4, () => 255);
    const overlay = outlineOverlayFromAlpha(data, 4, 4, { thickness: 1 });
    expect(alphaOf(overlay, 4, 0, 0)).toBe(255);
    expect(alphaOf(overlay, 4, 1, 1)).toBe(0);
  });

  it('produces nothing when there is no subject', () => {
    const overlay = outlineOverlayFromAlpha(rgba(4, 4, () => 0), 4, 4);
    expect(overlay.some((v) => v !== 0)).toBe(false);
  });

  it('thickens the stroke around the boundary', () => {
    const box = { x: 2, y: 2, w: 4, h: 4 };
    const data = rgba(8, 8, (x, y) => (inBox(x, y, box) ? 255 : 0));
    const thin = outlineOverlayFromAlpha(data, 8, 8, { thickness: 1 });
    const thick = outlineOverlayFromAlpha(data, 8, 8, { thickness: 3 });

    const count = (buf: Uint8ClampedArray) => {
      let n = 0;
      for (let i = 3; i < buf.length; i += 4) if (buf[i] > 0) n += 1;
      return n;
    };
    expect(count(thick)).toBeGreaterThan(count(thin));
    expect(alphaOf(thick, 8, 1, 1)).toBe(255);
  });
});
