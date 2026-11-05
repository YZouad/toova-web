import * as THREE from 'three';
import type { Item } from '../store';

const localRay = new THREE.Ray();
const invMatrix = new THREE.Matrix4();
const localOrigin = new THREE.Vector3();
const localDir = new THREE.Vector3();
const box = new THREE.Box3();
const hit = new THREE.Vector3();

/**
 * Analytic furniture pick: ray vs each item's axis-aligned box in item local
 * space (rotationY only). Avoids scene-wide intersectObjects, which freezes
 * on a full apartment with post-processing / wall meshes in the tree.
 * Rigid item transforms keep local hit distance equal to world distance.
 */
export function pickItemUnderRay(
  ray: THREE.Ray,
  items: Iterable<Item>,
  maxDistance = Infinity,
): { id: string; distance: number } | null {
  let bestId: string | null = null;
  let bestDist = maxDistance;

  for (const item of items) {
    const [w, h, d] = item.size;
    if (!(w > 0 && h > 0 && d > 0)) continue;

    const [x, y, z] = item.position;
    // Item group: position = bottom-center, rotationY for free-standing pieces.
    const rotY = item.kind === 'hanging' ? 0 : item.rotationY;
    invMatrix.makeRotationY(rotY);
    invMatrix.setPosition(x, y, z);
    invMatrix.invert();

    localOrigin.copy(ray.origin).applyMatrix4(invMatrix);
    localDir.copy(ray.direction).transformDirection(invMatrix).normalize();
    localRay.origin.copy(localOrigin);
    localRay.direction.copy(localDir);

    box.min.set(-w / 2, 0, -d / 2);
    box.max.set(w / 2, h, d / 2);
    const point = localRay.intersectBox(box, hit);
    if (!point) continue;

    const dist = localOrigin.distanceTo(point);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = item.id;
    }
  }

  return bestId ? { id: bestId, distance: bestDist } : null;
}
