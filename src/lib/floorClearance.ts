import {
  doorOpenings,
  getWallSegment,
  openingWorldPlacement,
  wallById,
  type FloorPlan,
  type FloorPlanOpening,
} from './floorPlanGeometry';
import { ROOM } from '../units';

export interface FootprintAabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function aabbsOverlap(a: FootprintAabb, b: FootprintAabb): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** Axis-aligned bounding box of a floor footprint at (cx, cz) with yaw rotation. */
export function rotatedFootprintAabb(
  cx: number,
  cz: number,
  width: number,
  depth: number,
  rotationY: number,
): FootprintAabb {
  const hw = width / 2;
  const hd = depth / 2;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const corners: Array<[number, number]> = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [lx, lz] of corners) {
    const x = cx + lx * c + lz * s;
    const z = cz - lx * s + lz * c;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

export function doorOpeningAabb(
  plan: FloorPlan,
  opening: FloorPlanOpening,
): FootprintAabb | null {
  const wall = wallById(plan, opening.wallId);
  if (!wall) return null;
  const seg = getWallSegment(plan, wall);
  const placed = openingWorldPlacement(plan, opening);
  if (!seg || !placed) return null;
  const [tx, tz] = seg.tangent;
  const inward: [number, number] = [-seg.outward[0], -seg.outward[1]];
  const half = opening.width / 2;
  const depth = ROOM.wallThickness + 24;
  const corners: Array<[number, number]> = [
    [-half, 0],
    [half, 0],
    [half, depth],
    [-half, depth],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [along, inw] of corners) {
    const x = placed.cx + tx * along + inward[0] * inw;
    const z = placed.cz + tz * along + inward[1] * inw;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

export function doorFootprintAABBs(plan: FloorPlan): FootprintAabb[] {
  return doorOpenings(plan)
    .map((o) => doorOpeningAabb(plan, o))
    .filter((a): a is FootprintAabb => a != null);
}

export function footprintBlocksDoor(
  plan: FloorPlan,
  cx: number,
  cz: number,
  width: number,
  depth: number,
  rotationY: number,
  doors: FootprintAabb[] = doorFootprintAABBs(plan),
): boolean {
  if (doors.length === 0) return false;
  const box = rotatedFootprintAabb(cx, cz, width, depth, rotationY);
  return doors.some((door) => aabbsOverlap(box, door));
}
