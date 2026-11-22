import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getCatalogDropSession,
  registerCatalogScreenToFloor,
  subscribeCatalogDrop,
  type CatalogDropSession,
} from './catalogDropBridge';
import { clampPositionInRoom } from './collision';
import { getActiveGeometry } from '../store';

/**
 * Registers screen→floor raycast for catalog drag-to-place and renders a
 * translucent footprint ghost while a drop session is active.
 */
export function CatalogDropController() {
  const { camera, gl } = useThree();
  const [session, setSession] = useState<CatalogDropSession | null>(getCatalogDropSession);

  useEffect(() => subscribeCatalogDrop(() => setSession(getCatalogDropSession())), []);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    registerCatalogScreenToFloor((clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const ok = raycaster.ray.intersectPlane(floorPlane, hit);
      if (!ok) return null;
      return { x: hit.x, z: hit.z };
    });

    return () => registerCatalogScreenToFloor(null);
  }, [camera, gl]);

  if (!session?.floor) return null;
  return <CatalogGhost session={session} />;
}

function CatalogGhost({ session }: { session: CatalogDropSession }) {
  const geom = getActiveGeometry();
  const [w, h, d] = session.sizeIn;
  const proposed: [number, number, number] = [session.floor!.x, 0, session.floor!.z];
  const clamped = clampPositionInRoom(proposed, 0, [w, h, d], geom);
  const moved =
    Math.hypot(clamped[0] - proposed[0], clamped[2] - proposed[2]) > 0.75;
  const valid = session.valid && !moved;
  const color = valid ? '#4A5F3A' : '#B0463C';

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        roughness: 0.9,
      }),
    [color],
  );

  useEffect(() => () => mat.dispose(), [mat]);

  return (
    <group position={[clamped[0], Math.max(0.5, h / 2), clamped[2]]}>
      <mesh material={mat}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      <mesh position={[0, -h / 2 + 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.55}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
