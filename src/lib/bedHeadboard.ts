import type { Item } from '../store';

export const DEFAULT_HEADBOARD_HEIGHT_IN = 28;
export const MIN_HEADBOARD_HEIGHT_IN = 12;
export const MAX_HEADBOARD_HEIGHT_IN = 48;
export const DEFAULT_HEADBOARD_WIDTH_SCALE = 1;
export const MIN_HEADBOARD_WIDTH_SCALE = 0.6;
export const MAX_HEADBOARD_WIDTH_SCALE = 1;
export const HEADBOARD_DEPTH_IN = 2;
export const DEFAULT_HEADBOARD_COLOR = '#6b4f33';

export function headboardHeightIn(item: Item): number {
  const h = item.headboardHeightIn ?? DEFAULT_HEADBOARD_HEIGHT_IN;
  return Math.min(MAX_HEADBOARD_HEIGHT_IN, Math.max(MIN_HEADBOARD_HEIGHT_IN, h));
}

export function headboardWidthScale(item: Item): number {
  const s = item.headboardWidthScale ?? DEFAULT_HEADBOARD_WIDTH_SCALE;
  return Math.min(MAX_HEADBOARD_WIDTH_SCALE, Math.max(MIN_HEADBOARD_WIDTH_SCALE, s));
}

export function resolveHeadboardColor(item: Item, frameColor: string): string {
  return item.headboardColor?.trim() || frameColor;
}

/** Top of headboard panel in local Y (inches above floor). */
export function headboardTopY(item: Item, legH: number): number {
  if (!item.headboardEnabled) return legH;
  return legH + headboardHeightIn(item);
}
