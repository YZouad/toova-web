import { proportionalSizesFromMaxSide } from './uniformItemSize';

/** Inch dimensions for an imported mesh in the room (W × H × D). */
export type InchSize = [number, number, number];

const MESH_INCH_THRESHOLD = 3;
export const DEFAULT_IMPORTED_MAX_SIDE = 24;
const RATIO_MATCH_TOLERANCE = 0.05;

export function parseInchDims(w: unknown, h: unknown, d: unknown): InchSize | null {
  const dims: InchSize = [
    typeof w === 'number' ? w : Number(w),
    typeof h === 'number' ? h : Number(h),
    typeof d === 'number' ? d : Number(d),
  ];
  if (!dims.every((x) => Number.isFinite(x) && x > 0)) return null;
  return dims;
}

export function maxInchSide(size: InchSize): number {
  return Math.max(size[0], size[1], size[2]);
}

function targetMaxFromDims(...candidates: (InchSize | undefined)[]): number {
  for (const dims of candidates) {
    if (dims && maxInchSide(dims) > MESH_INCH_THRESHOLD) {
      return maxInchSide(dims);
    }
  }
  return DEFAULT_IMPORTED_MAX_SIDE;
}

/** True when W/H/D ratios of `size` match those of mesh `natural` bounds. */
export function sizeRatiosMatchNatural(size: InchSize, natural: InchSize): boolean {
  const naturalMax = maxInchSide(natural);
  const sizeMax = maxInchSide(size);
  if (naturalMax <= 0 || sizeMax <= 0) return false;

  for (let i = 0; i < 3; i++) {
    const naturalRatio = natural[i] / naturalMax;
    const sizeRatio = size[i] / sizeMax;
    if (Math.abs(naturalRatio - sizeRatio) > RATIO_MATCH_TOLERANCE) return false;
  }
  return true;
}

/**
 * One-time placement size when mesh bounds are first measured.
 * After this, `item.size` is authoritative (user resize, save/load).
 */
export function resolveImportedInitialSize(
  size: InchSize,
  natural: InchSize,
  catalogSizeIn?: InchSize,
): InchSize {
  const naturalMax = maxInchSide(natural);

  if (naturalMax > MESH_INCH_THRESHOLD) {
    return [natural[0], natural[1], natural[2]];
  }

  const targetMax = targetMaxFromDims(catalogSizeIn, size);
  return proportionalSizesFromMaxSide(natural, targetMax);
}
