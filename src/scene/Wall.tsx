import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROOM } from '../units';

interface WallProps {
  length: number;
  height?: number;
  outwardNormal: [number, number, number];
  innerFaceCenter: [number, number, number];
  rotationY?: number;
  holes?: { x: number; y: number; w: number; h: number }[];
  color?: string;
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

/** Split a wall rectangle around axis-aligned openings (reliable vs ExtrudeGeometry holes). */
function wallSlabs(
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

function buildWallGeometry(
  length: number,
  height: number,
  holes: { x: number; y: number; w: number; h: number }[],
): THREE.BufferGeometry {
  const slabs = wallSlabs(length, height, holes);
  const parts = slabs.map((s) => {
    const w = s.x1 - s.x0;
    const h = s.y1 - s.y0;
    const geo = new THREE.BoxGeometry(w, h, ROOM.wallThickness);
    geo.translate((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, ROOM.wallThickness / 2);
    return geo;
  });
  if (parts.length === 0) {
    return new THREE.BoxGeometry(0.01, 0.01, 0.01);
  }
  if (parts.length === 1) {
    const geo = parts[0]!;
    geo.computeVertexNormals();
    return geo;
  }
  const merged = mergeGeometries(parts);
  if (!merged) {
    return parts[0]!;
  }
  merged.computeVertexNormals();
  return merged;
}

/**
 * One wall built from solid slabs with openings carved out.
 * Inner face sits at local z=0; thickness runs along +z (outward after rotation).
 */
export function Wall({
  length,
  height = ROOM.height,
  outwardNormal,
  innerFaceCenter,
  rotationY: rotationYProp,
  holes = [],
  color = '#d6cfc2',
}: WallProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);

  const geometry = useMemo(
    () => buildWallGeometry(length, height, holes),
    [length, height, holes],
  );

  const rotationY = useMemo(() => {
    if (rotationYProp != null) return rotationYProp;
    return Math.atan2(outwardNormal[0], outwardNormal[2]);
  }, [outwardNormal, rotationYProp]);

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;

    const worldNormal = new THREE.Vector3(...outwardNormal);
    const wallCenter = new THREE.Vector3(
      innerFaceCenter[0],
      innerFaceCenter[1] + height / 2,
      innerFaceCenter[2],
    );
    const toCamera = new THREE.Vector3().subVectors(camera.position, wallCenter).normalize();
    const exposure = toCamera.dot(worldNormal);

    const targetOpacity = exposure > 0 ? Math.max(0, 1 - exposure * 2.5) : 1;
    mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.18);
    mat.transparent = mat.opacity < 0.99;
    mat.depthWrite = mat.opacity > 0.95;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={innerFaceCenter}
      rotation={[0, rotationY, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        ref={matRef}
        color={color}
        roughness={0.95}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
