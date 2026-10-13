import { FURNITURE, type GalleryFurnitureKind } from '../furniture/registry';
import { planBounds, type FloorPlan } from './floorPlanGeometry';
import { limitsForCabinetKind, resolveCabinetDrawerGrid } from './furnitureBuild/cabinetDrawerGrid';
import type { FurnitureBuild } from './furnitureBuild';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function roomFootprintLimits(plan: FloorPlan): { maxW: number; maxD: number; maxH: number } {
  const bounds = planBounds(plan);
  const maxW = Math.max(18, Math.min(bounds.width - 18, bounds.width * 0.52));
  const maxD = Math.max(14, Math.min(bounds.depth - 18, bounds.depth * 0.48));
  const maxH = Math.max(24, plan.height - 4);
  return { maxW, maxD, maxH };
}

/** Suggest width/depth/height on build when the agent set drawer grid but not inch dims. */
export function enrichBuildDimensionsForRoom(
  plan: FloorPlan,
  kind: GalleryFurnitureKind,
  build: FurnitureBuild | undefined,
  query: string,
): FurnitureBuild | undefined {
  if (!build) return build;
  const { maxW, maxD, maxH } = roomFootprintLimits(plan);
  const next: FurnitureBuild = { ...build };

  if (kind === 'dresser' || kind === 'nightstand' || kind === 'desk') {
    const deskFront =
      kind === 'desk' &&
      (next.deskPullOut === 'front' ||
        next.deskPullOut === 'center' ||
        next.deskPedestal === 'front' ||
        next.deskPedestal === 'center');
    const limits = limitsForCabinetKind(kind, deskFront);
    const grid = resolveCabinetDrawerGrid(
      next,
      kind === 'nightstand' ? 2 : kind === 'desk' ? 3 : 4,
      limits,
    );
    next.drawerRows = grid.drawerRows;
    next.drawerColumns = grid.drawerColumns;

    if (!next.widthIn) {
      const colWidth = kind === 'nightstand' ? 13 : kind === 'desk' ? 14 : 14.5;
      const frame = kind === 'desk' ? 8 : 4;
      next.widthIn = grid.drawerColumns * colWidth + frame;
      if (kind === 'desk' && (next.deskPedestal === 'both' || next.deskPedestal === 'left' || next.deskPedestal === 'right')) {
        next.widthIn = Math.max(next.widthIn, 42);
      }
    }
    if (!next.depthIn) {
      next.depthIn = kind === 'nightstand' ? 16 : kind === 'desk' ? 24 : 18;
    }
    if (!next.heightIn) {
      next.heightIn =
        kind === 'nightstand'
          ? 24
          : kind === 'desk'
            ? 30
            : Math.min(34, 8 + grid.drawerRows * 5.5);
    }
  }

  if (/\bcompact|small|narrow|tight\b/i.test(query)) {
    if (next.widthIn) next.widthIn *= 0.88;
    if (next.depthIn) next.depthIn *= 0.92;
  }
  if (/\btall|wide|large|spacious\b/i.test(query)) {
    if (next.widthIn) next.widthIn *= 1.08;
    if (next.heightIn && kind === 'dresser') next.heightIn *= 1.06;
  }

  if (next.widthIn) next.widthIn = clamp(next.widthIn, 12, maxW);
  if (next.depthIn) next.depthIn = clamp(next.depthIn, 12, maxD);
  if (next.heightIn) next.heightIn = clamp(next.heightIn, 12, maxH);

  return next;
}

export function clampAgenticPieceSize(
  plan: FloorPlan,
  kind: GalleryFurnitureKind,
  size: [number, number, number],
): [number, number, number] {
  const { maxW, maxD, maxH } = roomFootprintLimits(plan);
  const def = FURNITURE[kind];
  const minW = Math.min(def.size[0], 12);
  const minD = Math.min(def.size[2], 12);
  const minH = Math.min(def.size[1], 12);
  return [
    clamp(size[0], minW, maxW),
    clamp(size[1], minH, maxH),
    clamp(size[2], minD, maxD),
  ];
}
