import type { Item } from '../store';
import { useStore } from '../store';

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

export const ROOM_INSET = 1;

// ---------------------------------------------------------------------------
// Full placement validation
// ---------------------------------------------------------------------------

export interface ValidationResult { ok: boolean; reason?: string; }

/**
 * Checks: room bounds, no volume conflicts.
 * Objects are allowed to float; gravity is handled separately.
 */
export function validatePlacement(candidate: Item, others: Item[]): ValidationResult {
  const rect = itemRect(candidate);

  const r = room();
  if (rect.minX < ROOM_INSET || rect.maxX > r.width - ROOM_INSET ||
      rect.minZ < ROOM_INSET || rect.maxZ > r.depth - ROOM_INSET) {
    return { ok: false, reason: 'Outside room' };
  }

  for (const other of others) {
    if (other.id === candidate.id) continue;
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

// ---------------------------------------------------------------------------
// Height-slider physics
// ---------------------------------------------------------------------------

/**
 * Find the nearest Y to `desiredY` that avoids volume conflicts with all others
 * at the candidate's current XZ position.
 *
 * Behaviour:
 *  - Moving down → stops on the top surface of whatever is below.
 *  - Moving up   → stops on the underside of whatever is above.
 *  - Snaps to the closest boundary (top or bottom of blocker) when blocked.
 */
export function findValidElevation(candidate: Item, others: Item[], desiredY: number): number {
  const h = candidate.size[1];
  const maxY = Math.max(0, room().height - h);
  const rect = itemRect(candidate);
  let y = Math.max(0, Math.min(maxY, desiredY));

  for (const other of others) {
    if (other.id === candidate.id) continue;
    if (!rectsOverlap(rect, itemRect(other), -0.5)) continue;

    const oBot = other.position[1];
    const oTop = oBot + other.size[1];

    // Would placing at y cause this item to penetrate `other`?
    if (y < oTop - 0.25 && y + h > oBot + 0.25) {
      const above = oTop;          // rest on top of other
      const below = oBot - h;      // sit entirely below other

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

/**
 * Drop the candidate from `fromY` to the highest valid resting surface at or
 * below it (floor, or top of another item).  Used when drag is released.
 */
export function settleGravity(candidate: Item, others: Item[], fromY: number): number {
  const h = candidate.size[1];
  const maxY = Math.max(0, room().height - h);
  const startY = Math.max(0, Math.min(maxY, fromY));
  const rect = itemRect(candidate);

  const surfaces: number[] = [0];
  for (const other of others) {
    if (other.id === candidate.id) continue;
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

  // Last resort: try floor even if no overlapping support was found.
  if (startY > 0.5) {
    const floorTest: Item = { ...candidate, position: [candidate.position[0], 0, candidate.position[2]] };
    if (validatePlacement(floorTest, others).ok) return 0;
  }

  return startY;
}

// ---------------------------------------------------------------------------
// XZ clamping / wall touching
// ---------------------------------------------------------------------------

/**
 * Returns true when the item's bounding rect is within `tolerance` inches of
 * any wall inner face.
 */
export function isTouchingWall(item: Item, tolerance = 6): boolean {
  const rect = itemRect(item);
  const r = room();
  return (
    rect.minX <= ROOM_INSET + tolerance ||
    rect.maxX >= r.width  - ROOM_INSET - tolerance ||
    rect.minZ <= ROOM_INSET + tolerance ||
    rect.maxZ >= r.depth  - ROOM_INSET - tolerance
  );
}

/** Clamp a proposed XZ position so the item stays within the room interior. */
export function clampToRoom(item: Item, proposedX: number, proposedZ: number): [number, number] {
  const [w, , d] = item.size;
  const c = Math.abs(Math.cos(item.rotationY));
  const s = Math.abs(Math.sin(item.rotationY));
  const halfW = (w * c + d * s) / 2;
  const halfD = (w * s + d * c) / 2;
  const r = room();
  return [
    Math.max(ROOM_INSET + halfW, Math.min(r.width - ROOM_INSET - halfW, proposedX)),
    Math.max(ROOM_INSET + halfD, Math.min(r.depth - ROOM_INSET - halfD, proposedZ)),
  ];
}
