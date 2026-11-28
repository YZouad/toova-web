import type { BinaryMask, GrayImage } from './types';

function idx(w: number, x: number, y: number): number {
  return y * w + x;
}

export function rgbaToGray(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): GrayImage {
  const n = width * height;
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    const r = rgba[o] ?? 0;
    const g = rgba[o + 1] ?? 0;
    const b = rgba[o + 2] ?? 0;
    data[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return { width, height, data };
}

export function histogram(gray: GrayImage): Uint32Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.data.length; i += 1) {
    hist[gray.data[i]!]! += 1;
  }
  return hist;
}

export function otsuThreshold(hist: Uint32Array): number {
  const total = hist.reduce((a, b) => a + b, 0);
  if (total === 0) return 128;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t]!;
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let best = 128;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      best = t;
    }
  }
  return best;
}

export function thresholdGray(gray: GrayImage, threshold?: number): BinaryMask {
  const t = threshold ?? otsuThreshold(histogram(gray));
  const data = new Uint8Array(gray.data.length);
  for (let i = 0; i < gray.data.length; i += 1) {
    data[i] = gray.data[i]! <= t ? 1 : 0;
  }
  return { width: gray.width, height: gray.height, data };
}

export function invertMask(mask: BinaryMask): BinaryMask {
  const data = new Uint8Array(mask.data.length);
  for (let i = 0; i < mask.data.length; i += 1) {
    data[i] = mask.data[i]! ? 0 : 1;
  }
  return { width: mask.width, height: mask.height, data };
}

export function cloneMask(mask: BinaryMask): BinaryMask {
  return { width: mask.width, height: mask.height, data: mask.data.slice() };
}

function morphOp(
  mask: BinaryMask,
  size: number,
  combine: (vals: number[]) => number,
): BinaryMask {
  const r = (size - 1) >> 1;
  const { width: w, height: h } = mask;
  const out = new Uint8Array(mask.data.length);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const vals: number[] = [];
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            vals.push(mask.data[idx(w, nx, ny)]!);
          } else {
            vals.push(0);
          }
        }
      }
      out[idx(w, x, y)] = combine(vals);
    }
  }
  return { width: w, height: h, data: out };
}

export function dilate(mask: BinaryMask, size = 3): BinaryMask {
  return morphOp(mask, size, (vals) => (vals.some((v) => v) ? 1 : 0));
}

export function erode(mask: BinaryMask, size = 3): BinaryMask {
  return morphOp(mask, size, (vals) => (vals.every((v) => v) ? 1 : 0));
}

export function open(mask: BinaryMask, size = 3): BinaryMask {
  return dilate(erode(mask, size), size);
}

export function close(mask: BinaryMask, size = 3): BinaryMask {
  return erode(dilate(mask, size), size);
}

export function countOn(mask: BinaryMask): number {
  let n = 0;
  for (let i = 0; i < mask.data.length; i += 1) {
    if (mask.data[i]) n += 1;
  }
  return n;
}

export function maskAndNot(a: BinaryMask, b: BinaryMask): BinaryMask {
  const data = new Uint8Array(a.data.length);
  for (let i = 0; i < a.data.length; i += 1) {
    data[i] = a.data[i]! && !b.data[i]! ? 1 : 0;
  }
  return { width: a.width, height: a.height, data };
}