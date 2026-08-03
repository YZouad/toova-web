import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  allWallSegments,
  holesForWallSegment,
  type RoomGeometry,
  type WallSegment,
} from '../lib/roomGeometry';
import { getProceduralMaterialMaps } from '../lib/proceduralTextures';
import type { MaterialPresetId } from '../lib/roomMaterials';
import { useOrbitFade } from './useOrbitFade';

const BASEBOARD_H = 4.5;
const BASEBOARD_T = 0.75;
/** Extra clearance past the door leaf so trim/jambs aren't covered. */
const DOOR_GAP_PAD = 3.5;
/** Pull ends in slightly so corner overlaps don't z-fight. */
const END_INSET = 0.75;

/**
 * Door spans in the same local-X frame as wall holes / baseboard placement.
 * Floor-anchored openings (y === 0) are treated as doors.
 */
export function doorGapsForSegment(
  geom: RoomGeometry,
  seg: WallSegment,
): { lo: number; hi: number }[] {
  return holesForWallSegment(geom, seg)
    .filter((h) => h.y <= 0.5)
    .map((h) => {
      const half = h.w / 2 + DOOR_GAP_PAD;
      return { lo: h.x - half, hi: h.x + half };
    })
    .sort((a, b) => a.lo - b.lo);
}

export function baseboardRunsForSegment(
  geom: RoomGeometry,
  seg: WallSegment,
): { start: number; end: number }[] {
  const end = seg.length / 2 - END_INSET;
  let cursor = -seg.length / 2 + END_INSET;
  const runs: { start: number; end: number }[] = [];
  const spans = doorGapsForSegment(geom, seg);

  for (const span of spans) {
    const gapLo = Math.max(span.lo, -seg.length / 2);
    const gapHi = Math.min(span.hi, seg.length / 2);
    if (gapLo > cursor + 0.5) {
      runs.push({ start: cursor, end: Math.min(gapLo, end) });
    }
    cursor = Math.max(cursor, gapHi);
  }
  if (cursor < end - 0.5) runs.push({ start: cursor, end });
  return runs.filter((r) => r.end - r.start >= 1);
}

/**
 * Interior baseboards along each wall segment, gapped at door openings.
 */
export function Baseboards({
  geom,
  trimPreset,
  visible = true,
}: {
  geom: RoomGeometry;
  trimPreset: MaterialPresetId;
  visible?: boolean;
}) {
  const segments = useMemo(() => allWallSegments(geom), [geom]);
  if (!visible) return null;

  return (
    <group>
      {segments.map((seg) => (
        <BaseboardSegment key={seg.wall.id} seg={seg} geom={geom} trimPreset={trimPreset} />
      ))}
    </group>
  );
}

function BaseboardSegment({
  seg,
  geom,
  trimPreset,
}: {
  seg: WallSegment;
  geom: RoomGeometry;
  trimPreset: MaterialPresetId;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);

  const mat = useMemo(() => {
    const maps = getProceduralMaterialMaps(trimPreset);
    const m = new THREE.MeshStandardMaterial({
      color: maps.color,
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: maps.roughness,
      metalness: maps.metalness,
      transparent: true,
    });
    const scale = 1 / maps.repeatInches;
    for (const t of [maps.map, maps.normalMap, maps.roughnessMap]) {
      t.repeat.set(scale, scale);
    }
    return m;
  }, [trimPreset]);

  useEffect(() => {
    matRef.current = mat;
    return () => {
      mat.dispose();
    };
  }, [mat]);

  const [ox, oz] = seg.outward;
  const center: [number, number, number] = [
    seg.innerFaceCenter[0],
    BASEBOARD_H / 2,
    seg.innerFaceCenter[2],
  ];

  useOrbitFade([matRef], [ox, 0, oz], center, { groupRef });

  const runs = useMemo(() => baseboardRunsForSegment(geom, seg), [geom, seg]);
  const inward = [-ox, -oz] as [number, number];
  const inset = BASEBOARD_T / 2 + 0.15;
  const [tx, tz] = seg.tangent;

  return (
    <group ref={groupRef}>
      {runs.map((run, i) => {
        const len = run.end - run.start;
        const midLocal = (run.start + run.end) / 2;
        const px = seg.innerFaceCenter[0] + tx * midLocal + inward[0] * inset;
        const pz = seg.innerFaceCenter[2] + tz * midLocal + inward[1] * inset;
        return (
          <mesh
            key={`${seg.wall.id}-${i}`}
            position={[px, BASEBOARD_H / 2, pz]}
            rotation={[0, seg.rotationY, 0]}
            castShadow
            receiveShadow
            material={mat}
          >
            <boxGeometry args={[len, BASEBOARD_H, BASEBOARD_T]} />
          </mesh>
        );
      })}
    </group>
  );
}
