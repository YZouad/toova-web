import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ROOM } from '../units';

interface WallProps {
  // length along the wall (its horizontal axis)
  length: number;
  // height
  height?: number;
  // outward normal in world space (unit length)
  outwardNormal: [number, number, number];
  // world position of the inner face's bottom-center
  innerFaceCenter: [number, number, number];
  // optional rectangular hole(s) cut in the wall (x, y, w, h) in wall-local coords
  // local x is horizontal along the wall (centered, range [-length/2, +length/2])
  // local y is vertical (range [0, height])
  holes?: { x: number; y: number; w: number; h: number }[];
  color?: string;
}

/**
 * One wall, extruded from a 2D shape with optional holes.
 * Inner face sits at local z=0; extrusion runs into -z (outside).
 * Outward normal is +z in local space, mapped to world via rotation.
 */
export function Wall({ length, height = ROOM.height, outwardNormal, innerFaceCenter, holes = [], color = '#d6cfc2' }: WallProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-length / 2, 0);
    shape.lineTo(length / 2, 0);
    shape.lineTo(length / 2, height);
    shape.lineTo(-length / 2, height);
    shape.lineTo(-length / 2, 0);

    for (const h of holes) {
      const hole = new THREE.Path();
      const x0 = h.x - h.w / 2;
      const x1 = h.x + h.w / 2;
      const y0 = h.y;
      const y1 = h.y + h.h;
      hole.moveTo(x0, y0);
      hole.lineTo(x1, y0);
      hole.lineTo(x1, y1);
      hole.lineTo(x0, y1);
      hole.lineTo(x0, y0);
      shape.holes.push(hole);
    }

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: ROOM.wallThickness,
      bevelEnabled: false,
    });
    geo.computeVertexNormals();
    return geo;
  }, [length, height, holes]);

  // Yaw so that local +Z (extrusion direction) matches world outwardNormal.
  // Three.js: local vector (0,0,1) becomes (sin θ, 0, cos θ) after rotation Y by θ,
  // so we need θ = atan2(nx, nz). (Removing the erroneous leading minus — that flipped
  // east/west walls so the solid protruded inward and swallowed objects visually.)
  const rotationY = useMemo(() => {
    return Math.atan2(outwardNormal[0], outwardNormal[2]);
  }, [outwardNormal]);

  // Fade per frame.
  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;

    const worldNormal = new THREE.Vector3(...outwardNormal);
    // wall center (mid-height of inner face)
    const wallCenter = new THREE.Vector3(
      innerFaceCenter[0],
      innerFaceCenter[1] + height / 2,
      innerFaceCenter[2],
    );
    const toCamera = new THREE.Vector3().subVectors(camera.position, wallCenter).normalize();
    const exposure = toCamera.dot(worldNormal);

    // exposure > 0 => camera is on the outside of this wall => fade out
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
