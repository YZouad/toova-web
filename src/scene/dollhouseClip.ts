import * as THREE from 'three';

/** Shared horizontal clip plane for the dollhouse wall cut (world Y). */
export const DOLLHOUSE_CUT_HEIGHT = 40;

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
 * Create materials with this plane already attached so enabling
 * `gl.localClippingEnabled` never forces a shader recompile on focus.
 * Harmless while clipping is disabled (single-room mode).
 */
export function dollhouseClipPlanes(): THREE.Plane[] {
  return [getDollhouseClipPlane()];
}
