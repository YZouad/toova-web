import * as THREE from 'three';

/**
 * Assign planar UVs on ShapeGeometry / BufferGeometry so U = world X / scale,
 * V = world Z / scale (or Y for vertical walls). Coordinates are in inches.
 */
export function applyPlanarUVs(
  geometry: THREE.BufferGeometry,
  options: {
    /** Axis mapped to U. */
    u: 'x' | 'y' | 'z';
    /** Axis mapped to V. */
    v: 'x' | 'y' | 'z';
    /** Inches per UV unit (tile size). Default 1 → UV = world inches. */
    inchesPerUv?: number;
    /** Optional origin offset. */
    origin?: { u: number; v: number };
  },
): void {
  const pos = geometry.getAttribute('position');
  if (!pos) return;
  const scale = options.inchesPerUv ?? 1;
  const ou = options.origin?.u ?? 0;
  const ov = options.origin?.v ?? 0;
  const uvs = new Float32Array(pos.count * 2);
  const get = (i: number, axis: 'x' | 'y' | 'z') => {
    const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    return pos.getComponent(i, idx);
  };
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = (get(i, options.u) - ou) / scale;
    uvs[i * 2 + 1] = (get(i, options.v) - ov) / scale;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.attributes.uv!.needsUpdate = true;
}

/** Box slab UVs: local X → U, local Y → V, scaled by inches. */
export function applyWallSlabUVs(
  geometry: THREE.BufferGeometry,
  inchesPerUv = 1,
): void {
  applyPlanarUVs(geometry, { u: 'x', v: 'y', inchesPerUv });
}

/**
 * After ShapeGeometry is created in XZ (then often rotated), set UVs from
 * the shape's x/y attributes which map to world X/Z before rotation.
 */
export function applyFloorShapeUVs(
  geometry: THREE.BufferGeometry,
  inchesPerUv = 1,
): void {
  // ShapeGeometry puts shape x→position.x, shape y→position.y before mesh rotation.
  applyPlanarUVs(geometry, { u: 'x', v: 'y', inchesPerUv });
}
