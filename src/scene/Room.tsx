import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ROOM } from '../units';
import { sampleSun } from '../lib/environment';
import {
  allWallSegments,
  doorOpenings,
  floorFaceLoops,
  holesForWallSegment,
  openingWorldPlacement,
  planBounds,
  planCentroid,
  windowOpenings,
  type RoomGeometry,
} from '../lib/roomGeometry';
import { useStore } from '../store';
import { Wall } from './Wall';

const WALL_COLOR_A = '#d8d0c2';
const WALL_COLOR_B = '#cfc7b8';

interface OpeningPlacement {
  cx: number;
  cy: number;
  cz: number;
  outward: [number, number, number];
  rotationY: number;
  w: number;
  h: number;
  kind: 'door' | 'window';
  sill: number;
}

function placementsFromGeometry(geom: RoomGeometry): OpeningPlacement[] {
  return geom.openings
    .map((o) => {
      const p = openingWorldPlacement(geom, o);
      if (!p) return null;
      return {
        cx: p.cx,
        cy: p.cy,
        cz: p.cz,
        outward: p.outward,
        rotationY: p.rotationY,
        w: p.w,
        h: p.h,
        kind: o.kind,
        sill: o.sill ?? 0,
      };
    })
    .filter((p): p is OpeningPlacement => p != null);
}

function WindowGlass({
  placement,
  glassTint,
}: {
  placement: OpeningPlacement;
  glassTint: string;
}) {
  const { w, h, sill, cx, cy, cz, rotationY } = placement;
  const t = 1;

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, cy, 0]}>
        <planeGeometry args={[w - 1, h - 1]} />
        <meshPhysicalMaterial
          color={glassTint}
          roughness={0.05}
          transmission={0.85}
          thickness={0.5}
          transparent
          opacity={0.4}
        />
      </mesh>
      <mesh position={[0, sill - 0.75, t]}>
        <boxGeometry args={[w + 3, 1.5, 2]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[0, sill + h + 0.75, t]}>
        <boxGeometry args={[w + 3, 1.5, 2]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
    </group>
  );
}

function WindowFillLight({
  placement,
  color,
  intensity,
}: {
  placement: OpeningPlacement;
  color: string;
  intensity: number;
}) {
  const lightRef = useRef<THREE.SpotLight>(null!);
  const targetRef = useRef<THREE.Object3D>(null!);
  const { cx, cy, cz, outward } = placement;
  const outside = [cx + outward[0] * 35, cy, cz + outward[2] * 35] as [number, number, number];
  const inside = [cx - outward[0] * 25, cy, cz - outward[2] * 25] as [number, number, number];

  useLayoutEffect(() => {
    const light = lightRef.current;
    const target = targetRef.current;
    if (light && target) light.target = target;
  }, []);

  return (
    <>
      <spotLight
        ref={lightRef}
        position={outside}
        color={color}
        intensity={intensity}
        angle={Math.PI / 3.2}
        penumbra={0.45}
        distance={450}
        decay={1.5}
      />
      <object3D ref={targetRef} position={inside} />
    </>
  );
}

function WindowAssembly({ geom }: { geom: RoomGeometry }) {
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const exposure = useStore((s) => s.environment.exposure);

  const placements = useMemo(
    () => placementsFromGeometry(geom).filter((p) => p.kind === 'window'),
    [geom],
  );

  const sun = useMemo(
    () => sampleSun(timeOfDay, orientationDeg, planBounds(geom)),
    [timeOfDay, orientationDeg, geom],
  );

  return (
    <group>
      {placements.map((w, i) => (
        <WindowGlass key={`glass-${i}`} placement={w} glassTint={sun.glassTint} />
      ))}
      {placements.map((w, i) => (
        <WindowFillLight
          key={`fill-${i}`}
          placement={w}
          color={sun.glassTint}
          intensity={sun.ambient * exposure * 0.55 + sun.intensity * exposure * 0.15}
        />
      ))}
    </group>
  );
}

function DoorFrames({ geom }: { geom: RoomGeometry }) {
  const doors = doorOpenings(geom);
  return (
    <group>
      {doors.map((door) => {
        const p = openingWorldPlacement(geom, door);
        if (!p) return null;
        const w = door.width;
        const h = door.height;
        const t = 2;
        const f = 1.5;
        const rot = p.rotationY;
        return (
          <group key={door.id} position={[p.cx, 0, p.cz]} rotation={[0, rot, 0]}>
            <mesh position={[-w / 2 - f / 2, h / 2, t / 2]} castShadow>
              <boxGeometry args={[f, h, t]} />
              <meshStandardMaterial color="#3a2e22" roughness={0.7} />
            </mesh>
            <mesh position={[w / 2 + f / 2, h / 2, t / 2]} castShadow>
              <boxGeometry args={[f, h, t]} />
              <meshStandardMaterial color="#3a2e22" roughness={0.7} />
            </mesh>
            <mesh position={[0, h + f / 2, t / 2]} castShadow>
              <boxGeometry args={[w + 2 * f, f, t]} />
              <meshStandardMaterial color="#3a2e22" roughness={0.7} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function floorShapesFromGeometry(geom: RoomGeometry): THREE.Shape[] {
  const loops = floorFaceLoops(geom);
  if (loops.length === 0) {
    const b = planBounds(geom);
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(b.width, 0);
    s.lineTo(b.width, b.depth);
    s.lineTo(0, b.depth);
    s.closePath();
    return [s];
  }
  return loops.map((verts) => {
    const s = new THREE.Shape();
    s.moveTo(verts[0]!.x, verts[0]!.z);
    for (let i = 1; i < verts.length; i++) {
      s.lineTo(verts[i]!.x, verts[i]!.z);
    }
    s.closePath();
    return s;
  });
}

function FloorMesh({ geom }: { geom: RoomGeometry }) {
  const shapes = useMemo(() => floorShapesFromGeometry(geom), [geom]);

  return (
    <group>
      {shapes.map((shape, i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color="#8b6f4e" roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/** Invisible ceiling that still casts shadows when enabled in environment settings. */
function ShadowRoof({ geom }: { geom: RoomGeometry }) {
  const enabled = useStore((s) => s.environment.shadowRoof);
  const shapes = useMemo(() => floorShapesFromGeometry(geom), [geom]);
  const shadowMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial();
    m.colorWrite = false;
    m.depthWrite = false;
    m.transparent = true;
    return m;
  }, []);

  if (!enabled) return null;

  return (
    <group>
      {shapes.map((shape, i) => (
        <mesh
          key={i}
          position={[0, geom.height, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow={false}
          material={shadowMat}
        >
          <shapeGeometry args={[shape]} />
        </mesh>
      ))}
    </group>
  );
}

export function Room() {
  const geom = useStore((s) => s.roomGeometry);
  const H = geom.height;
  const segments = useMemo(() => allWallSegments(geom), [geom]);

  return (
    <group>
      <FloorMesh geom={geom} />

      {segments.map((seg, i) => {
        const renderLength = seg.length + ROOM.wallThickness;
        return (
        <Wall
          key={seg.wall.id}
          length={renderLength}
          height={H}
          outwardNormal={[seg.outward[0], 0, seg.outward[1]]}
          innerFaceCenter={seg.innerFaceCenter}
          rotationY={seg.rotationY}
          holes={holesForWallSegment(geom, seg)}
          color={i % 2 === 0 ? WALL_COLOR_A : WALL_COLOR_B}
        />
        );
      })}

      <DoorFrames geom={geom} />
      <WindowAssembly geom={geom} />
      <ShadowRoof geom={geom} />
    </group>
  );
}
