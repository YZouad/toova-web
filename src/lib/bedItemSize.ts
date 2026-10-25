import { FURNITURE } from '../furniture/registry';
import type { Item } from '../store';

/** Frame + mattress stack (excludes legs). Matches procedural twin bed default. */
export function defaultBedBodyHeightIn(): number {
  return FURNITURE.bed.size[1];
}

export function bedLegHeightIn(item: Pick<Item, 'bedLegHeight'>): number {
  return item.bedLegHeight ?? 8;
}

export function standardBedTotalHeightIn(legHeight: number): number {
  return legHeight + defaultBedBodyHeightIn();
}

/** Footprint scale for beds — width/depth only; stack height stays default body + legs. */
export function proportionalBedFootprintFromMaxSide(
  size: [number, number, number],
  maxFootprint: number,
  legHeight = 8,
): [number, number, number] {
  const curMax = Math.max(size[0], size[2], 1e-6);
  const scale = maxFootprint / curMax;
  return [size[0] * scale, standardBedTotalHeightIn(legHeight), size[2] * scale];
}

export function maxBedFootprintSide(size: [number, number, number]): number {
  return Math.max(size[0], size[2]);
}

export function bedFitDimensionLabel(axis: 0 | 1 | 2, isBed: boolean): string {
  if (isBed && axis === 1) return 'Leg height';
  if (axis === 0) return 'Width';
  if (axis === 1) return 'Height';
  return 'Depth';
}

export function bedFitDimensionValue(item: Item, axis: 0 | 1 | 2): number {
  if (item.kind === 'bed' && axis === 1) return bedLegHeightIn(item);
  return item.size[axis];
}

export function bedFitDimensionLimits(
  item: Item,
  axis: 0 | 1 | 2,
  roomHeight: number,
  maxFootprint: number,
): { min: number; max: number; step: number } {
  if (item.kind === 'bed' && axis === 1) {
    return { min: 4, max: 36, step: 1 };
  }
  return {
    min: axis === 1 ? 4 : 1,
    max: axis === 1 ? roomHeight : maxFootprint,
    step: 0.5,
  };
}
