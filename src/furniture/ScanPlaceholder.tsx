import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { Item } from '../store';

const statusLabel: Record<NonNullable<Item['scanStatus']>, string> = {
  pending: 'identifying…',
  matching: 'matching catalog…',
  generating: 'building 3D model…',
  done: '',
  failed: 'could not identify',
};

/** LiDAR volume stays in the room until a real mesh is attached. */
export function isBlockedScanVolume(item: Item): boolean {
  if (!item.scanObjectId || item.importedUrl) return false;
  // RoomPlan already knows how to render these categories with Toova's procedural
  // furniture. Keep that useful preview visible while catalog enhancement runs.
  // A volume is reserved for categories that have no trustworthy built-in shape.
  return item.kind === 'imported';
}

function isResolving(status: Item['scanStatus']): boolean {
  return status === 'pending' || status === 'matching' || status === 'generating' || status == null;
}

export function ScanPlaceholder({ item }: { item: Item }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [w, h, d] = item.size;
  const status = item.scanStatus ?? 'pending';
  const working = isResolving(item.scanStatus);
  const workingRef = useRef(working);
  workingRef.current = working;
  const label = `${item.label} · ${statusLabel[status] || statusLabel.pending}`;

  useFrame(({ clock }) => {
    const material = meshRef.current?.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    material.opacity = workingRef.current
      ? 0.72 + Math.sin(clock.elapsedTime * 2.2) * 0.06
      : 0.62;
  });

  return (
    <group position={[0, h / 2, 0]}>
      <mesh ref={meshRef} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color="#9aa3ad"
          transparent
          opacity={0.62}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(w, h, d)]} />
        <lineBasicMaterial color="#ffffff" transparent opacity={0.55} />
      </lineSegments>
      <mesh position={[0, h / 2 + 8, 0]}>
        <planeGeometry args={[Math.max(w, 24), 10]} />
        <meshBasicMaterial color="#1a1a1a" transparent opacity={0.72} />
      </mesh>
      {/* Text label via simple sprite substitute — HTML would break R3F; use scale as hint */}
      <mesh position={[0, h / 2 + 8, 0.1]} visible={false} userData={{ scanLabel: label }} />
    </group>
  );
}
