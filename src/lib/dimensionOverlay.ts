import type { WallSegment } from './floorPlanGeometry';
import { formatLength } from './floorPlanGeometry';
import { ROOM } from '../units';

export type DimVec3 = [number, number, number];
export type DimLinePair = [DimVec3, DimVec3];

/** Height above floor for wall dimension runs (inches). */
export const WALL_DIM_FLOOR_Y = 4;
/** Offset from inner wall face into the room (inches). */
export const WALL_DIM_INSET = 8;

export interface WallDimGeometry {
  wallId: string;
  startExtension: DimLinePair;
  endExtension: DimLinePair;
  dimLine: DimLinePair;
  labelPosition: DimVec3;
  labelText: string;
}

function interiorNormal(outward: [number, number]): [number, number] {
  return [-outward[0], -outward[1]];
}

function innerFacePoint(
  x: number,
  z: number,
  interior: [number, number],
  y: number,
): DimVec3 {
  const inset = ROOM.wallThickness / 2;
  return [x + interior[0] * inset, y, z + interior[1] * inset];
}

function offsetIntoRoom(
  point: DimVec3,
  interior: [number, number],
  extra: number,
): DimVec3 {
  return [
    point[0] + interior[0] * extra,
    point[1],
    point[2] + interior[1] * extra,
  ];
}

/** CAD-style extension lines + dimension run for one wall segment. */
export function wallDimGeometry(seg: WallSegment): WallDimGeometry {
  const interior = interiorNormal(seg.outward);
  const y = WALL_DIM_FLOOR_Y;

  const innerStart = innerFacePoint(seg.start.x, seg.start.z, interior, y);
  const innerEnd = innerFacePoint(seg.end.x, seg.end.z, interior, y);
  const dimStart = offsetIntoRoom(innerStart, interior, WALL_DIM_INSET);
  const dimEnd = offsetIntoRoom(innerEnd, interior, WALL_DIM_INSET);

  const labelPosition: DimVec3 = [
    (dimStart[0] + dimEnd[0]) / 2,
    y + 2,
    (dimStart[2] + dimEnd[2]) / 2,
  ];

  return {
    wallId: seg.wall.id,
    startExtension: [innerStart, dimStart],
    endExtension: [innerEnd, dimEnd],
    dimLine: [dimStart, dimEnd],
    labelPosition,
    labelText: formatLength(seg.length, 'ft-in'),
  };
}

/** W × D × H label matching ContextBar / inspector convention. */
export function formatItemDimensions(size: [number, number, number]): string {
  return `${Math.round(size[0])}×${Math.round(size[2])}×${Math.round(size[1])}″`;
}

/** Anchor above the top of an item bounding box (matches SelectionHud). */
export function itemDimLabelAnchor(item: {
  position: [number, number, number];
  size: [number, number, number];
}): DimVec3 {
  const maxDim = Math.max(item.size[0], item.size[1], item.size[2], 8);
  const liftAbove = Math.min(14, Math.max(3, maxDim * 0.22 + 2));
  return [
    item.position[0],
    item.position[1] + item.size[1] + liftAbove,
    item.position[2],
  ];
}
