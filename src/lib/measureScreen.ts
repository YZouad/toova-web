import * as THREE from 'three';
import type { MeasureVec3 } from './measureDistance';

/** Project a world point to client pixel coordinates. */
export function worldToScreen(
  world: MeasureVec3,
  camera: THREE.Camera,
  canvasRect: DOMRect,
): [number, number] {
  const p = new THREE.Vector3(world[0], world[1], world[2]);
  p.project(camera);
  return [
    canvasRect.left + ((p.x + 1) / 2) * canvasRect.width,
    canvasRect.top + ((-p.y + 1) / 2) * canvasRect.height,
  ];
}
