import { useEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';

interface Props {
  color: string;
  boost: number;
  children: ReactNode;
}

/** Applies emissive tint to descendant meshes when an item emits light. */
export function EmitterGlow({ color, boost, children }: Props) {
  const groupRef = useRef<THREE.Group>(null!);

  useEffect(() => {
    const root = groupRef.current;
    if (!root || boost <= 0) return;
    const touched: THREE.MeshStandardMaterial[] = [];
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        touched.push(mat);
        mat.emissive = new THREE.Color(color);
        mat.emissiveIntensity = boost;
      }
    });
    return () => {
      for (const mat of touched) {
        mat.emissive.set('#000000');
        mat.emissiveIntensity = 0;
      }
    };
  }, [color, boost]);

  return <group ref={groupRef}>{children}</group>;
}
