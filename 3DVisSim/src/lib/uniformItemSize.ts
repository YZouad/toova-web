const EPS = 1e-6;

/** Scale W/H/D so the largest side becomes `maxSide`, preserving current ratios. */
export function proportionalSizesFromMaxSide(
  size: [number, number, number],
  maxSide: number,
): [number, number, number] {
  const curMax = Math.max(size[0], size[1], size[2], EPS);
  const r0 = size[0] / curMax;
  const r1 = size[1] / curMax;
  const r2 = size[2] / curMax;
  return [r0 * maxSide, r1 * maxSide, r2 * maxSide];
}
