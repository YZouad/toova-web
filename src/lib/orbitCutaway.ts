export interface OrbitWallCandidate {
  id: string;
  innerFaceCenter: [number, number, number];
  outward: [number, number];
}

export const ORBIT_FACING_THRESHOLD = 0.18;

function orientationBucket(nx: number, nz: number): number {
  const ang = Math.atan2(nz, nx);
  return Math.round(ang / (Math.PI / 8));
}

/**
 * Orbit cutaway: hide walls that face the camera. Two segments can share an
 * outward orientation (both arms of an L); only the nearest to the camera in
 * that orientation bucket is actually occluding, so only that id is hidden.
 */
export function pickOrbitHiddenWallIds(
  walls: readonly OrbitWallCandidate[],
  camera: { x: number; y: number; z: number },
  _centroid: { x: number; z: number },
  facingThreshold = ORBIT_FACING_THRESHOLD,
): Set<string> {
  const facing: Array<OrbitWallCandidate & { dist: number }> = [];

  for (const wall of walls) {
    const wx = wall.innerFaceCenter[0];
    const wy = wall.innerFaceCenter[1];
    const wz = wall.innerFaceCenter[2];
    const dx = camera.x - wx;
    const dy = camera.y - wy;
    const dz = camera.z - wz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) continue;
    const facingDot = (dx * wall.outward[0] + dz * wall.outward[1]) / len;
    if (facingDot <= facingThreshold) continue;
    facing.push({
      ...wall,
      dist: Math.hypot(camera.x - wx, camera.z - wz),
    });
  }

  const buckets = new Map<number, typeof facing>();
  for (const wall of facing) {
    const key = orientationBucket(wall.outward[0], wall.outward[1]);
    const list = buckets.get(key);
    if (list) list.push(wall);
    else buckets.set(key, [wall]);
  }

  const hidden = new Set<string>();
  for (const group of buckets.values()) {
    let nearest = group[0]!;
    for (const wall of group) {
      if (wall.dist < nearest.dist) nearest = wall;
    }
    hidden.add(nearest.id);
  }
  return hidden;
}

let orbitHiddenWallIds = new Set<string>();

export function getOrbitHiddenWallIds(): Set<string> {
  return orbitHiddenWallIds;
}

export function setOrbitHiddenWallIds(next: Set<string>): void {
  orbitHiddenWallIds = next;
}
