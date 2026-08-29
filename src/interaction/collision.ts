import type { RoomGeometry } from '../lib/roomGeometry';
import {
  allWallSegments,
  isTouchingAnyWall,
  planBounds,
  planCentroid,
  pointInPolygon,
} from '../lib/floorPlanGeometry';
import type { Item } from '../store';
import { useStore } from '../store';
import { ROOM } from '../units';

function room() {
  return useStore.getState().roomGeometry;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

export interface Rect {
  minX: number; maxX: number; minZ: number; maxZ: number;
}

/** AABB footprint of an item in XZ, accounting for Y-axis rotation. */
export function itemRect(item: Item): Rect {
  const [w, , d] = item.size;
  const c = Math.abs(Math.cos(item.rotationY));
  const s = Math.abs(Math.sin(item.rotationY));
  const halfW = (w * c + d * s) / 2;
  const halfD = (w * s + d * c) / 2;
  return {
    minX: item.position[0] - halfW,
    maxX: item.position[0] + halfW,
    minZ: item.position[2] - halfD,
    maxZ: item.position[2] + halfD,
  };
}

/** True when two XZ rects overlap. Positive eps = shrink gap needed; negative eps = require real overlap. */
export function rectsOverlap(a: Rect, b: Rect, eps = 0.5): boolean {
  return !(a.maxX <= b.minX + eps || a.minX >= b.maxX - eps ||
           a.maxZ <= b.minZ + eps || a.minZ >= b.maxZ - eps);
}

export function rectContains(outer: Rect, inner: Rect, eps = 0.5): boolean {
  return inner.minX >= outer.minX - eps &&
         inner.maxX <= outer.maxX + eps &&
         inner.minZ >= outer.minZ - eps &&
         inner.maxZ <= outer.maxZ + eps;
}

export function topSurfaceY(item: Item): number {
  return item.position[1] + item.size[1];
}

// ---------------------------------------------------------------------------
// Volume conflict
// ---------------------------------------------------------------------------

/**
 * True when items `a` and `b` share the same 3-D space.
 * Touching edges (eps gap) are allowed — only real penetration is blocked.
 */
export function volumeConflict(a: Item, b: Item, eps = 0.5): boolean {
  if (a.kind === 'hanging' || b.kind === 'hanging') return false;
  if (a.kind === 'light' || b.kind === 'light') return false;
  if (!rectsOverlap(itemRect(a), itemRect(b), -eps)) return false;
  const aY0 = a.position[1], aY1 = aY0 + a.size[1];
  const bY0 = b.position[1], bY1 = bY0 + b.size[1];
  return aY0 < bY1 - eps && aY1 > bY0 + eps;
}

// ---------------------------------------------------------------------------
// Clearance (interior space)
// ---------------------------------------------------------------------------

/**
 * Floor-to-underside clearance for items that have usable interior space.
 * Bed clearance = leg height.  Desk clearance = under-tabletop height.
 */
export function clearanceOf(item: Item): number {
  if (item.kind === 'bed') return item.bedLegHeight ?? 0;
  if (item.kind === 'desk') return item.size[1] - 1.5;
  return 0;
}

// ---------------------------------------------------------------------------
// Room bounds
// ---------------------------------------------------------------------------

/**
 * Floor-plan edges are wall centerlines; the inner face sits
 * `wallThickness/2` into the room. Keep footprints clear of that face.
 */
export const ROOM_INSET = ROOM.wallThickness / 2;

function footprintInsideRoom(rect: Rect, geom: RoomGeometry, inset = ROOM_INSET): boolean {
  const corners: [number, number][] = [
    [rect.minX, rect.minZ],
    [rect.maxX, rect.minZ],
    [rect.maxX, rect.maxZ],
    [rect.minX, rect.maxZ],
  ];
  return corners.every(([x, z]) => pointInPolygon(x, z, geom, inset));
}

/** Clamp XZ so the item footprint stays inside the floor-plan polygon. */
export function clampPositionInRoom(
  position: [number, number, number],
  rotationY: number,
  size: [number, number, number],
  geom: RoomGeometry,
): [number, number, number] {
  const rect = itemRect({ ...({} as Item), position, rotationY, size });
  const b = planBounds(geom);
  let x = position[0];
  let z = position[2];
  const halfW = (rect.maxX - rect.minX) / 2;
  const halfD = (rect.maxZ - rect.minZ) / 2;

  x = Math.max(b.minX + ROOM_INSET + halfW, Math.min(b.maxX - ROOM_INSET - halfW, x));
  z = Math.max(b.minZ + ROOM_INSET + halfD, Math.min(b.maxZ - ROOM_INSET - halfD, z));

  const testRect = {
    minX: x - halfW,
    maxX: x + halfW,
    minZ: z - halfD,
    maxZ: z + halfD,
  };
  if (footprintInsideRoom(testRect, geom)) {
    return [x, position[1], z];
  }

  // Binary search toward centroid if corner clamp isn't enough (concave rooms).
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  let bestX = x;
  let bestZ = z;
  for (let t = 0; t <= 1; t += 0.05) {
    const tx = x + (cx - x) * t;
    const tz = z + (cz - z) * t;
    const tr = {
      minX: tx - halfW,
      maxX: tx + halfW,
      minZ: tz - halfD,
      maxZ: tz + halfD,
    };
    if (footprintInsideRoom(tr, geom)) {
      bestX = tx;
      bestZ = tz;
    }
  }
  return [bestX, position[1], bestZ];
}

// ---------------------------------------------------------------------------
// Full placement validation
// ---------------------------------------------------------------------------

export interface ValidationResult { ok: boolean; reason?: string; }

/**
 * Checks: room bounds, no volume conflicts.
 * Objects are allowed to float; gravity is handled separately.
 */
export function validatePlacement(candidate: Item, others: Item[]): ValidationResult {
  if (candidate.kind === 'hanging' || candidate.kind === 'light') return { ok: true };

  const rect = itemRect(candidate);
  const r = room();

  if (!footprintInsideRoom(rect, r)) {
    return { ok: false, reason: 'Outside room' };
  }

  for (const other of others) {
    if (other.id === candidate.id) continue;
    if (other.kind === 'hanging' || other.kind === 'light') continue;
    if (!volumeConflict(candidate, other)) continue;

    // Tuck-under exception: item fits inside the interior clearance of a host (bed legs / desk space).
    const hostClearance = clearanceOf(other);
    if (hostClearance > 0.5) {
      const cTop = candidate.position[1] + candidate.size[1];
      if (candidate.size[1] <= hostClearance - 0.5 &&
          cTop <= other.position[1] + hostClearance + 0.5 &&
          rectContains(itemRect(other), rect)) continue;
    }

    // Reverse: candidate hosts the other item.
    const candClearance = clearanceOf(candidate);
    if (candClearance > 0.5) {
      const oTop = other.position[1] + other.size[1];
      if (other.size[1] <= candClearance - 0.5 &&
          oTop <= candidate.position[1] + candClearance + 0.5 &&
          rectContains(rect, itemRect(other))) continue;
    }

    return { ok: false, reason: `Overlaps ${other.label}` };
  }

  return { ok: true };
}

function firstSolidBlocker(candidate: Item, others: Item[]): Item | null {
  for (const other of others) {
    if (other.id === candidate.id) continue;
    if (other.kind === 'hanging' || other.kind === 'light') continue;
    if (!volumeConflict(candidate, other)) continue;
    if (validatePlacement(candidate, [other]).ok) continue;
    return other;
  }
  return null;
}

/** Minimum XZ translation that separates overlapping AABBs, along the shorter axis. */
function mtvXZ(a: Rect, b: Rect, clearance = 0.5): { x: number; z: number } {
  const left = a.maxX - (b.minX - clearance);
  const right = (b.maxX + clearance) - a.minX;
  const down = a.maxZ - (b.minZ - clearance);
  const up = (b.maxZ + clearance) - a.minZ;
  const xMag = Math.min(left, right);
  const zMag = Math.min(down, up);
  const pad = 0.05;
  if (xMag <= zMag) {
    return { x: (left < right ? -1 : 1) * (xMag + pad), z: 0 };
  }
  return { x: 0, z: (down < up ? -1 : 1) * (zMag + pad) };
}

/**
 * Keep a pose legal: clamp to the room (same as rotating against a wall),
 * then nudge XZ out of any solid furniture overlap.
 */
export function resolveValidXZ(
  candidate: Item,
  others: Item[],
): { position: [number, number, number]; ok: boolean } {
  const geom = room();
  const y = candidate.position[1];
  let [x, , z] = clampPositionInRoom(
    candidate.position,
    candidate.rotationY,
    candidate.size,
    geom,
  );
  let next: Item = { ...candidate, position: [x, y, z] };
  if (validatePlacement(next, others).ok) {
    return { position: next.position, ok: true };
  }

  for (let i = 0; i < 8; i++) {
    const blocker = firstSolidBlocker(next, others);
    if (!blocker) break;
    const push = mtvXZ(itemRect(next), itemRect(blocker));
    [x, , z] = clampPositionInRoom(
      [next.position[0] + push.x, y, next.position[2] + push.z],
      next.rotationY,
      next.size,
      geom,
    );
    next = { ...next, position: [x, y, z] };
    if (validatePlacement(next, others).ok) {
      return { position: next.position, ok: true };
    }
  }

  return { position: next.position, ok: validatePlacement(next, others).ok };
}

/** Check whether all placed items fit inside a proposed floor plan. */
export function itemsFitPlan(items: Item[], plan: RoomGeometry): Item[] {
  const outside: Item[] = [];
  for (const item of items) {
    if (item.kind === 'hanging') continue;
    if (item.kind === 'light') continue;
    const rect = itemRect(item);
    if (!footprintInsideRoom(rect, plan)) outside.push(item);
  }
  return outside;
}

// ---------------------------------------------------------------------------
// Height-slider physics
// ---------------------------------------------------------------------------

/**
 * Find the nearest Y to `desiredY` that avoids volume conflicts with all others
 * at the candidate's current XZ position.
 */
export function findValidElevation(candidate: Item, others: Item[], desiredY: number): number {
  const h = candidate.size[1];
  const maxY = Math.max(0, room().height - h);
  const rect = itemRect(candidate);
  let y = Math.max(0, Math.min(maxY, desiredY));

  for (const other of others) {
    if (other.id === candidate.id) continue;
    if (other.kind === 'hanging' || other.kind === 'light') continue;
    if (!rectsOverlap(rect, itemRect(other), -0.5)) continue;

    const oBot = other.position[1];
    const oTop = oBot + other.size[1];

    if (y < oTop - 0.25 && y + h > oBot + 0.25) {
      const above = oTop;
      const below = oBot - h;

      const aboveOk = above <= maxY;
      const belowOk = below >= 0;

      if (aboveOk && belowOk) {
        y = Math.abs(above - desiredY) <= Math.abs(below - desiredY) ? above : below;
      } else if (aboveOk) {
        y = above;
      } else if (belowOk) {
        y = below;
      } else {
        y = 0;
      }
    }
  }

  return Math.max(0, Math.min(maxY, y));
}

// ---------------------------------------------------------------------------
// Gravity / settle
// ---------------------------------------------------------------------------

export function settleGravity(candidate: Item, others: Item[], fromY: number): number {
  const h = candidate.size[1];
  const maxY = Math.max(0, room().height - h);
  const startY = Math.max(0, Math.min(maxY, fromY));
  const rect = itemRect(candidate);

  const surfaces: number[] = [0];
  for (const other of others) {
    if (other.id === candidate.id) continue;
    if (other.kind === 'hanging' || other.kind === 'light') continue;
    if (!rectsOverlap(rect, itemRect(other), -0.5)) continue;
    const top = topSurfaceY(other);
    if (top <= startY + 0.5) surfaces.push(top);
  }

  surfaces.sort((a, b) => b - a);
  for (const sy of surfaces) {
    if (sy > startY + 0.5) continue;
    const test: Item = { ...candidate, position: [candidate.position[0], sy, candidate.position[2]] };
    if (validatePlacement(test, others).ok) return sy;
  }

  if (startY > 0.5) {
    const floorTest: Item = { ...candidate, position: [candidate.position[0], 0, candidate.position[2]] };
    if (validatePlacement(floorTest, others).ok) return 0;
  }

  return startY;
}

// ---------------------------------------------------------------------------
// XZ clamping / wall touching
// ---------------------------------------------------------------------------

export function isTouchingWall(item: Item, tolerance = 6): boolean {
  const rect = itemRect(item);
  return isTouchingAnyWall(rect.minX, rect.maxX, rect.minZ, rect.maxZ, room(), tolerance);
}

/** Lights and wall shelves keep their height while dragging; other wall-mounts only when flush. */
export function itemPinsElevation(item: Item): boolean {
  if (item.kind === 'light') return true;
  if (item.kind === 'shelf') return item.wallMounted !== false;
  return !!(item.wallMounted && isTouchingWall(item));
}

/** Typical floating-shelf height (inches from floor to the underside of the board). */
export const DEFAULT_SHELF_ELEVATION = 48;

/** Place a wall shelf flush against the longest wall, board parallel to the floor. */
export function defaultWallShelfPose(
  geom: RoomGeometry,
  size: [number, number, number],
): { position: [number, number, number]; rotationY: number } {
  const [, h, d] = size;
  const y = Math.max(0, Math.min(DEFAULT_SHELF_ELEVATION, geom.height - h));
  const wideEnough = allWallSegments(geom).filter((s) => s.length >= size[0] + 4);
  const pool = wideEnough.length > 0 ? wideEnough : allWallSegments(geom);
  const seg = pool.slice().sort((a, b) => b.length - a.length)[0];
  if (!seg) {
    const [cx, cz] = planCentroid(geom);
    return { position: [cx, y, cz], rotationY: 0 };
  }
  const interiorX = -seg.outward[0];
  const interiorZ = -seg.outward[1];
  const inset = d / 2 + ROOM_INSET;
  const raw: [number, number, number] = [
    seg.innerFaceCenter[0] + interiorX * inset,
    y,
    seg.innerFaceCenter[2] + interiorZ * inset,
  ];
  const [x, , z] = clampPositionInRoom(raw, seg.rotationY, size, geom);
  return { position: [x, y, z], rotationY: seg.rotationY };
}

export function clampToRoom(item: Item, proposedX: number, proposedZ: number): [number, number] {
  const [x, , z] = clampPositionInRoom(
    [proposedX, item.position[1], proposedZ],
    item.rotationY,
    item.size,
    room(),
  );
  return [x, z];
}

// ---------------------------------------------------------------------------
// Drag resolution (XZ)
// ---------------------------------------------------------------------------

export interface DragMover {
  item: Item;
  start: [number, number, number];
}

/** True when every mover can sit at start + (dx, dz) without overlaps. */
export function groupDeltaValid(
  movers: DragMover[],
  others: Item[],
  dx: number,
  dz: number,
): boolean {
  for (const { item, start } of movers) {
    const [cx, cz] = clampToRoom(item, start[0] + dx, start[2] + dz);
    const pos: [number, number, number] = [cx, start[1], cz];
    if (!validatePlacement({ ...item, position: pos }, others).ok) return false;
  }
  return true;
}

function lastValidOnAxis(
  from: number,
  desired: number,
  test: (value: number) => boolean,
): number {
  if (test(desired)) return desired;
  let lo = from;
  let hi = desired;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (test(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Shared XZ delta for a drag. Follows the cursor until something solid is hit,
 * then slides along the face instead of freezing in place.
 *
 * If the current pose is already illegal, the desired delta is used so the
 * user can drag out of the overlap.
 */
export function resolveGroupDragDelta(
  movers: DragMover[],
  others: Item[],
  desiredDx: number,
  desiredDz: number,
  fromDx: number,
  fromDz: number,
): { dx: number; dz: number; desiredOk: boolean } {
  const valid = (dx: number, dz: number) => groupDeltaValid(movers, others, dx, dz);
  const desiredOk = valid(desiredDx, desiredDz);
  if (desiredOk) return { dx: desiredDx, dz: desiredDz, desiredOk };

  if (!valid(fromDx, fromDz)) {
    return { dx: desiredDx, dz: desiredDz, desiredOk };
  }

  const xThenZ = () => {
    const dx = lastValidOnAxis(fromDx, desiredDx, (x) => valid(x, fromDz));
    const dz = lastValidOnAxis(fromDz, desiredDz, (z) => valid(dx, z));
    return { dx, dz };
  };
  const zThenX = () => {
    const dz = lastValidOnAxis(fromDz, desiredDz, (z) => valid(fromDx, z));
    const dx = lastValidOnAxis(fromDx, desiredDx, (x) => valid(x, dz));
    return { dx, dz };
  };

  const a = xThenZ();
  const b = zThenX();
  const err = (p: { dx: number; dz: number }) =>
    (p.dx - desiredDx) ** 2 + (p.dz - desiredDz) ** 2;
  const best = err(a) <= err(b) ? a : b;
  return { ...best, desiredOk };
}
