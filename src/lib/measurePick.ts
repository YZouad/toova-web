import * as THREE from 'three';
import type { MeasureVec3 } from './measureDistance';

export type MeasureSnapKind = 'corner' | 'edge' | 'wall' | 'grid' | null;

export interface MeasureHit {
  point: MeasureVec3;
  normal: MeasureVec3;
  wallId?: string | null;
  itemId?: string | null;
  snapKind?: MeasureSnapKind;
}

function materialOpacity(obj: THREE.Object3D): number {
  const mesh = obj as THREE.Mesh;
  const rawMat = mesh.material;
  const mats: THREE.Material[] = Array.isArray(rawMat)
    ? rawMat
    : rawMat
      ? [rawMat]
      : [];
  return mats.reduce((min, m) => {
    const o = (m as THREE.Material & { opacity?: number }).opacity;
    return Math.min(min, o ?? 1);
  }, 1);
}

function shouldSkipObject(obj: THREE.Object3D): boolean {
  if (!obj.visible) return true;
  if (obj.userData?.hangingPick === false) return true;
  if (obj.userData?.measurePick === false) return true;
  if (obj.userData?.measureGizmo === true) return true;
  if (obj.userData?.heightArrow === true) return true;
  return false;
}

/**
 * Raycast scene for a measure surface hit.
 * Accepts floor, walls, ceiling, furniture, and openings.
 * Skips shadow proxies, faded cutaway walls, volumetric helpers, and measure gizmos.
 */
export function pickMeasureSurface(
  raycaster: THREE.Raycaster,
  scene: THREE.Object3D,
): MeasureHit | null {
  const hits = raycaster.intersectObjects(scene.children, true);

  for (const hit of hits) {
    const objHit = hit.object;
    if (shouldSkipObject(objHit)) continue;
    if (materialOpacity(objHit) < 0.4) continue;

    let obj: THREE.Object3D | null = objHit;
    let wallId: string | null = null;
    let itemId: string | null = null;
    let skip = false;
    while (obj) {
      if (shouldSkipObject(obj)) {
        skip = true;
        break;
      }
      if (!obj.visible) {
        skip = true;
        break;
      }
      if (obj.userData?.wallId) wallId = obj.userData.wallId as string;
      if (obj.userData?.itemId && !obj.userData?.hanging) {
        itemId = obj.userData.itemId as string;
      }
      obj = obj.parent;
    }
    if (skip) continue;

    const n = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);

    return {
      point: [hit.point.x, hit.point.y, hit.point.z],
      normal: [n.x, n.y, n.z],
      wallId,
      itemId,
      snapKind: null,
    };
  }

  return null;
}
