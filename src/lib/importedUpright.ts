import type { InchSize } from './importedItemSize';

const STAND_UP_LABEL = /\b(monitor|television|tv|screen|display|lamp|clock)\b/i;

export function shouldStandImportedUpright(label: string | undefined | null): boolean {
  return STAND_UP_LABEL.test((label ?? '').trim());
}

export function isFlatOnY(size: InchSize): boolean {
  return size[1] < size[0] && size[1] < size[2];
}

/** Long thin mesh along X (e.g. a floor lamp generated on its side). */
export function isPoleAlongX(size: InchSize): boolean {
  return size[0] > size[1] * 2 && size[0] > size[2] * 2;
}

export type StandUpAxis = 'x' | 'z';

export function standUpRotationAxis(size: InchSize): StandUpAxis | null {
  if (isFlatOnY(size)) return 'x';
  if (isPoleAlongX(size)) return 'z';
  return null;
}

/**
 * Stand a lying-flat panel (Y thinnest) or a pole along X so the long axis is up.
 */
export function standUpFlatBounds(size: InchSize): InchSize {
  const axis = standUpRotationAxis(size);
  if (axis === 'x') return [size[0], size[2], size[1]];
  if (axis === 'z') return [size[1], size[0], size[2]];
  return size;
}
