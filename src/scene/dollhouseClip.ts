import * as THREE from 'three';
import type { FloorPlan } from '../lib/floorPlanGeometry';

/** Fallback cut height when a plan has no windows (inches). */
export const DOLLHOUSE_CUT_HEIGHT = 40;

const DEFAULT_SILL = 36;
const SILL_CLEARANCE = 4;
const CUT_MIN = 24;
const CUT_MAX = 40;

let clipPlane: THREE.Plane | null = null;

export function getDollhouseClipPlane(): THREE.Plane {
  if (!clipPlane) {
    clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), DOLLHOUSE_CUT_HEIGHT);
  }
  return clipPlane;
}

/** Update the cut height (plane constant = cutY when normal is (0,-1,0)). */
export function setDollhouseCutHeight(cutY: number) {
  const plane = getDollhouseClipPlane();
  plane.constant = cutY;
}

/**
 * Cut just below the lowest window sill so sill boards vanish in the dollhouse.
 * Falls back to {@link DOLLHOUSE_CUT_HEIGHT} when there are no windows.
 */
export function dollhouseCutHeightFor(plan: Pick<FloorPlan, 'openings'>): number {
  let minSill = Infinity;
  for (const o of plan.openings) {
    if (o.kind !== 'window') continue;
    minSill = Math.min(minSill, o.sill ?? DEFAULT_SILL);
  }
  if (!Number.isFinite(minSill)) return DOLLHOUSE_CUT_HEIGHT;
  return Math.min(CUT_MAX, Math.max(CUT_MIN, minSill - SILL_CLEARANCE));
}

/**
 * Create materials with this plane already attached so enabling
 * `gl.localClippingEnabled` never forces a shader recompile on focus.
 * Harmless while clipping is disabled (single-room mode).
 */
export function dollhouseClipPlanes(): THREE.Plane[] {
  return [getDollhouseClipPlane()];
}
