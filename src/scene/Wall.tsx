import { useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { ROOM } from '../units';
import { applyWallSlabUVs } from '../lib/shapeUVs';
import { getTintableWallMaps } from '../lib/proceduralTextures';
import { useOrbitFade } from './useOrbitFade';

interface WallProps {
  length: number;
  height?: number;
  outwardNormal: [number, number, number];
  innerFaceCenter: [number, number, number];
  rotationY?: number;
  holes?: { x: number; y: number; w: number; h: number }[];
  /** Wall segment id — used for deterministic cutaway. */
  wallId?: string;
  /** When true in cutaway modes, hide this wall entirely. */
  cutAway?: boolean;
  /** Free paint color; multiplies the shared plaster texture. */
  color: string;
}

type SlabRect = { x0: number; x1: number; y0: number; y1: number };

function subtractHole(rect: SlabRect, hole: SlabRect): SlabRect[] {
  if (hole.x1 <= rect.x0 || hole.x0 >= rect.x1 || hole.y1 <= rect.y0 || hole.y0 >= rect.y1) {
    return [rect];
  }
  const out: SlabRect[] = [];
  if (rect.y1 > hole.y1) {
    out.push({ x0: rect.x0, x1: rect.x1, y0: hole.y1, y1: rect.y1 });
  }
  if (rect.y0 < hole.y0) {
    out.push({ x0: rect.x0, x1: rect.x1, y0: rect.y0, y1: hole.y0 });
  }
  const y0 = Math.max(rect.y0, hole.y0);
  const y1 = Math.min(rect.y1, hole.y1);
  if (rect.x0 < hole.x0) {
    out.push({ x0: rect.x0, x1: hole.x0, y0, y1 });
  }
  if (rect.x1 > hole.x1) {
    out.push({ x0: hole.x1, x1: rect.x1, y0, y1 });
  }
  return out;
}

/** Split a wall rectangle around axis-aligned openings (used by tests / tooling). */
export function wallSlabs(
  length: number,
  height: number,
  holes: { x: number; y: number; w: number; h: number }[],
): SlabRect[] {
  let rects: SlabRect[] = [{ x0: -length / 2, x1: length / 2, y0: 0, y1: height }];
  for (const h of holes) {
    const hole: SlabRect = {
      x0: h.x - h.w / 2,
      x1: h.x + h.w / 2,
      y0: h.y,
      y1: h.y + h.h,
    };
    rects = rects.flatMap((r) => subtractHole(r, hole));
  }
  return rects.filter((r) => r.x1 - r.x0 > 0.25 && r.y1 - r.y0 > 0.25);
}

/**
 * Single extruded wall with openings as shape holes — no slab seams at door/window headers.
 */
export function buildWallGeometry(
  length: number,
  height: number,
  holes: { x: number; y: number; w: number; h: number }[],
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0);
  shape.lineTo(length / 2, 0);
  shape.lineTo(length / 2, height);
  shape.lineTo(-length / 2, height);
  shape.closePath();

  for (const h of holes) {
    const x0 = h.x - h.w / 2;
    const x1 = h.x + h.w / 2;
    const y0 = Math.max(0, h.y);
    const y1 = Math.min(height, h.y + h.h);
    if (x1 - x0 < 0.5 || y1 - y0 < 0.5) continue;
    // Opposite winding to the outer shape so the hole cuts through.
    const path = new THREE.Path();
    path.moveTo(x0, y0);
    path.lineTo(x0, y1);
    path.lineTo(x1, y1);
    path.lineTo(x1, y0);
    path.closePath();
    shape.holes.push(path);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: ROOM.wallThickness,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  // UVs in inches so plaster tiles at repeatInches via texture.repeat.
  applyWallSlabUVs(geo, 1);
  geo.computeVertexNormals();
  return geo;
}

/**
 * One wall built as a continuous extruded slab with openings carved out.
 * Inner face sits at local z=0; thickness runs along +z (outward after rotation).
 *
 * Visual mesh can orbit-fade; a separate no-map proxy always casts shadows so
 * sunlight stays blocked when the wall is transparent.
 */
export function Wall({
  length,
  height = ROOM.height,
  outwardNormal,
  innerFaceCenter,
  rotationY: rotationYProp,
  holes = [],
  wallId,
  cutAway = false,
  color,
}: WallProps) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const groupRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null!);

  const holesKey = holes.map((h) => `${h.x}:${h.y}:${h.w}:${h.h}`).join('|');
  const geometry = useMemo(
    () => buildWallGeometry(length, height, holes),
    // holes is often a fresh array each parent render — key by contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [length, height, holesKey],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  const maps = useMemo(() => getTintableWallMaps(), []);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color,
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: maps.roughness,
      metalness: maps.metalness,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 1,
    });
    // DoubleSide in the shadow pass — FrontSide alone flips to BackSide and
    // fails to occlude for extruded wall slabs.
    m.shadowSide = THREE.DoubleSide;
    const scale = 1 / maps.repeatInches;
    for (const t of [maps.map, maps.normalMap, maps.roughnessMap]) {
      t.repeat.set(scale, scale);
      t.needsUpdate = true;
    }
    return m;
  }, [maps, color]);

  // No textures — Three copies `map` onto the depth material and that breaks casting.
  const shadowMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
      colorWrite: false,
      depthWrite: false,
    });
    m.shadowSide = THREE.DoubleSide;
    return m;
  }, []);

  useEffect(() => {
    matRef.current = material;
    material.color.set(color);
    return () => {
      material.dispose();
    };
  }, [material, color]);

  useEffect(() => () => shadowMaterial.dispose(), [shadowMaterial]);

  useLayoutEffect(() => {
    const mesh = shadowRef.current;
    if (!mesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
  });

  const rotationY = useMemo(() => {
    if (rotationYProp != null) return rotationYProp;
    return Math.atan2(outwardNormal[0], outwardNormal[2]);
  }, [outwardNormal, rotationYProp]);

  const center: [number, number, number] = [
    innerFaceCenter[0],
    innerFaceCenter[1] + height / 2,
    innerFaceCenter[2],
  ];

  useOrbitFade([matRef], outwardNormal, center, { groupRef, hidden: cutAway });

  if (cutAway) return null;

  return (
    <group ref={groupRef}>
      {/* Always-on shadow occluder — stays solid in the shadow map while the
          visible wall fades for orbit cutaway. */}
      <mesh
        ref={shadowRef}
        geometry={geometry}
        position={innerFaceCenter}
        rotation={[0, rotationY, 0]}
        castShadow
        receiveShadow={false}
        frustumCulled={false}
        material={shadowMaterial}
        userData={{ hangingPick: false }}
        raycast={() => {
          /* shadow-only proxy — never participate in hanging surface picks */
        }}
      />
      <mesh
        geometry={geometry}
        position={innerFaceCenter}
        rotation={[0, rotationY, 0]}
        castShadow={false}
        receiveShadow
        material={material}
        userData={wallId ? { wallId } : undefined}
      />
    </group>
  );
}
