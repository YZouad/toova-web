import type { DeskPedestalSide, DeskPullOut, FurnitureBuild } from './types';

export type DeskPullOutDims = {
  widthIn: number;
  depthIn: number;
  heightIn: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Side layout only (legacy center/front live on deskPullOut). */
export function normalizeDeskSidePedestal(ped?: string): DeskPedestalSide {
  if (ped === 'left' || ped === 'right' || ped === 'both') return ped;
  return 'none';
}

/** Map legacy deskPedestal center/front into deskPullOut. */
export function normalizeDeskPullOut(
  pullOut: DeskPullOut | undefined,
  legacyPedestal?: string,
): DeskPullOut {
  if (pullOut === 'front' || pullOut === 'center') return pullOut;
  if (legacyPedestal === 'front') return 'front';
  if (legacyPedestal === 'center') return 'center';
  return 'none';
}

export function maxPullOutWidthIn(
  deskW: number,
  side: DeskPedestalSide,
  pedestalW = Math.min(deskW * 0.24, 15),
): number {
  const margin = 1.1;
  if (side === 'both') return Math.max(8, deskW - pedestalW * 2 - margin * 2);
  if (side === 'left' || side === 'right') return Math.max(8, deskW - pedestalW - margin * 2);
  return Math.max(8, deskW - margin * 2);
}

export function defaultPullOutDims(
  deskW: number,
  deskD: number,
  deskH: number,
  side: DeskPedestalSide,
): DeskPullOutDims {
  const topT = 1.5;
  const legH = deskH - topT;
  return {
    widthIn: maxPullOutWidthIn(deskW, side),
    depthIn: clamp(Math.round(deskD * 0.32 * 10) / 10, 4, Math.max(4, deskD - 2)),
    heightIn: clamp(Math.round(Math.min(5, Math.max(3.5, legH * 0.15)) * 10) / 10, 3, 6),
  };
}

export function resolvePullOutDims(
  deskW: number,
  deskD: number,
  deskH: number,
  side: DeskPedestalSide,
  build: FurnitureBuild,
): DeskPullOutDims {
  const defaults = defaultPullOutDims(deskW, deskD, deskH, side);
  const maxW = maxPullOutWidthIn(deskW, side);
  const maxD = Math.max(4, deskD - 1.5);
  return {
    widthIn: clamp(
      typeof build.pullOutWidthIn === 'number' ? build.pullOutWidthIn : defaults.widthIn,
      6,
      maxW,
    ),
    depthIn: clamp(
      typeof build.pullOutDepthIn === 'number' ? build.pullOutDepthIn : defaults.depthIn,
      3,
      maxD,
    ),
    heightIn: clamp(
      typeof build.pullOutHeightIn === 'number' ? build.pullOutHeightIn : defaults.heightIn,
      2.5,
      8,
    ),
  };
}
