import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ROOM, DOOR } from '../units';
import { sampleSun } from '../lib/environment';
import {
  holesForWall,
  windowWorldPlacement,
  type RoomGeometry,
  type RoomWindow,
} from '../lib/roomGeometry';
import { useStore } from '../store';
import { Wall } from './Wall';

const SHORT_WALL_COLOR = '#d8d0c2';
const LONG_WALL_COLOR = '#cfc7b8';
const CORNER_CAP_COLOR = '#d3cac0';

interface WindowPlacement {
  win: RoomWindow;
  cx: number;
  cy: number;
  cz: number;
  outward: [number, number, number];
}

function placementsFromGeometry(geom: RoomGeometry): WindowPlacement[] {
  return geom.windows.map((win) => {
    const p = windowWorldPlacement(geom, win);
    return {
      win,
      cx: p.cx,
      cy: p.cy,
      cz: p.cz,
      outward: p.outward,
    };
  });
}

function WindowGlass({
  placement,
  glassTint,
}: {
  placement: WindowPlacement;
  glassTint: string;
}) {
  const { win, cx, cy, cz, outward } = placement;
  const inset = 0.1;
  const frameZ = cz - outward[2] * inset - outward[0] * inset;
  const frameX = cx - outward[0] * inset;
  const sillY = win.y;

  return (
    <group>
      <mesh position={[frameX, cy, frameZ]}>
        <planeGeometry args={[win.w - 1, win.h - 1]} />
        <meshPhysicalMaterial
          color={glassTint}
          roughness={0.05}
          transmission={0.85}
          thickness={0.5}
          transparent
          opacity={0.4}
        />
      </mesh>
      <mesh position={[frameX, sillY - 0.75, frameZ - outward[2]]}>
        <boxGeometry args={[win.w + 3, 1.5, 2]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[frameX, sillY + win.h + 0.75, frameZ - outward[2]]}>
        <boxGeometry args={[win.w + 3, 1.5, 2]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[frameX - win.w / 2 - 0.75, cy, frameZ - outward[2]]}>
        <boxGeometry args={[1.5, win.h, 2]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[frameX + win.w / 2 + 0.75, cy, frameZ - outward[2]]}>
        <boxGeometry args={[1.5, win.h, 2]} />
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
  placement: WindowPlacement;
  color: string;
  intensity: number;
}) {
  const lightRef = useRef<THREE.SpotLight>(null!);
  const targetRef = useRef<THREE.Object3D>(null!);
  const { cx, cy, cz, outward } = placement;
  const outside = [
    cx + outward[0] * 35,
    cy,
    cz + outward[2] * 35,
  ] as [number, number, number];
  const inside = [
    cx - outward[0] * 25,
    cy,
    cz - outward[2] * 25,
  ] as [number, number, number];

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

  const placements = useMemo(() => placementsFromGeometry(geom), [geom]);

  const sun = useMemo(
    () => sampleSun(timeOfDay, orientationDeg, geom),
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

export function Room() {
  const geom = useStore((s) => s.roomGeometry);
  const W = geom.width;
  const D = geom.depth;
  const H = geom.height;

  return (
    <group>
      <mesh
        position={[W / 2, 0, D / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#8b6f4e" roughness={0.85} />
      </mesh>

      <Wall
        length={W}
        height={H}
        outwardNormal={[0, 0, -1]}
        innerFaceCenter={[W / 2, 0, 0]}
        holes={[{ x: 0, y: 0, w: DOOR.width, h: DOOR.height }, ...holesForWall(geom, 'south')]}
        color={SHORT_WALL_COLOR}
      />

      <Wall
        length={W}
        height={H}
        outwardNormal={[0, 0, 1]}
        innerFaceCenter={[W / 2, 0, D]}
        holes={holesForWall(geom, 'north')}
        color={SHORT_WALL_COLOR}
      />

      <Wall
        length={D}
        height={H}
        outwardNormal={[-1, 0, 0]}
        innerFaceCenter={[0, 0, D / 2]}
        holes={holesForWall(geom, 'west')}
        color={LONG_WALL_COLOR}
      />

      <Wall
        length={D}
        height={H}
        outwardNormal={[1, 0, 0]}
        innerFaceCenter={[W, 0, D / 2]}
        holes={holesForWall(geom, 'east')}
        color={LONG_WALL_COLOR}
      />

      <WallCornerVolumes width={W} depth={D} height={H} />

      <DoorFrame width={W} />

      <WindowAssembly geom={geom} />
    </group>
  );
}

function WallCornerVolumes({
  width: W,
  depth: D,
  height: h,
}: {
  width: number;
  depth: number;
  height: number;
}) {
  const t = ROOM.wallThickness;
  const y = h / 2;

  const boxGeo = useMemo(() => new THREE.BoxGeometry(t, h, t), [t, h]);

  return (
    <group>
      <WallCornerPost
        geometry={boxGeo}
        height={h}
        position={[-t / 2, y, -t / 2]}
        faceColors={cornerFaceColors.sw}
        shortNormal={[0, 0, -1]}
        longNormal={[-1, 0, 0]}
        fadeOrigin={[0, h / 2, 0]}
      />
      <WallCornerPost
        geometry={boxGeo}
        height={h}
        position={[W + t / 2, y, -t / 2]}
        faceColors={cornerFaceColors.se}
        shortNormal={[0, 0, -1]}
        longNormal={[1, 0, 0]}
        fadeOrigin={[W, h / 2, 0]}
      />
      <WallCornerPost
        geometry={boxGeo}
        height={h}
        position={[-t / 2, y, D + t / 2]}
        faceColors={cornerFaceColors.nw}
        shortNormal={[0, 0, 1]}
        longNormal={[-1, 0, 0]}
        fadeOrigin={[0, h / 2, D]}
      />
      <WallCornerPost
        geometry={boxGeo}
        height={h}
        position={[W + t / 2, y, D + t / 2]}
        faceColors={cornerFaceColors.ne}
        shortNormal={[0, 0, 1]}
        longNormal={[1, 0, 0]}
        fadeOrigin={[W, h / 2, D]}
      />
    </group>
  );
}

const cornerFaceColors = {
  sw: [SHORT_WALL_COLOR, LONG_WALL_COLOR, CORNER_CAP_COLOR, CORNER_CAP_COLOR, LONG_WALL_COLOR, SHORT_WALL_COLOR],
  se: [LONG_WALL_COLOR, SHORT_WALL_COLOR, CORNER_CAP_COLOR, CORNER_CAP_COLOR, SHORT_WALL_COLOR, SHORT_WALL_COLOR],
  nw: [SHORT_WALL_COLOR, LONG_WALL_COLOR, CORNER_CAP_COLOR, CORNER_CAP_COLOR, SHORT_WALL_COLOR, LONG_WALL_COLOR],
  ne: [LONG_WALL_COLOR, SHORT_WALL_COLOR, CORNER_CAP_COLOR, CORNER_CAP_COLOR, SHORT_WALL_COLOR, LONG_WALL_COLOR],
} as const;

interface WallCornerPostProps {
  geometry: THREE.BoxGeometry;
  height: number;
  position: [number, number, number];
  faceColors: readonly [string, string, string, string, string, string];
  shortNormal: [number, number, number];
  longNormal: [number, number, number];
  fadeOrigin: [number, number, number];
}

function WallCornerPost({
  geometry,
  height,
  position,
  faceColors,
  shortNormal,
  longNormal,
  fadeOrigin,
}: WallCornerPostProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const materials = useMemo(() => {
    return faceColors.map(
      (color) =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.95,
          metalness: 0,
          side: THREE.DoubleSide,
        }),
    );
  }, [faceColors]);

  const nShort = useMemo(() => new THREE.Vector3(...shortNormal), [shortNormal]);
  const nLong = useMemo(() => new THREE.Vector3(...longNormal), [longNormal]);
  const origin = useMemo(() => new THREE.Vector3(...fadeOrigin), [fadeOrigin]);

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh || !Array.isArray(mesh.material)) return;

    const toCamera = new THREE.Vector3().subVectors(camera.position, origin).normalize();
    const exposureShort = toCamera.dot(nShort);
    const exposureLong = toCamera.dot(nLong);
    const opacityShort =
      exposureShort > 0 ? Math.max(0, 1 - exposureShort * 2.5) : 1;
    const opacityLong = exposureLong > 0 ? Math.max(0, 1 - exposureLong * 2.5) : 1;

    const perFaceTargetOpacity: number[] = [
      faceColors[0] === SHORT_WALL_COLOR ? opacityShort : opacityLong,
      faceColors[1] === SHORT_WALL_COLOR ? opacityShort : opacityLong,
      Math.min(opacityShort, opacityLong),
      Math.min(opacityShort, opacityLong),
      faceColors[4] === SHORT_WALL_COLOR ? opacityShort : opacityLong,
      faceColors[5] === SHORT_WALL_COLOR ? opacityShort : opacityLong,
    ];

    const mats = mesh.material as THREE.MeshStandardMaterial[];
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i];
      const targetOpacity = perFaceTargetOpacity[i] ?? 1;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.18);
      mat.transparent = mat.opacity < 0.99;
      mat.depthWrite = mat.opacity > 0.95;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} material={materials} position={position} castShadow receiveShadow />
  );
}

function DoorFrame({ width }: { width: number }) {
  const cx = width / 2;
  const w = DOOR.width;
  const h = DOOR.height;
  const t = 2;
  const f = 1.5;
  return (
    <group>
      <mesh position={[cx - w / 2 - f / 2, h / 2, t / 2]} castShadow>
        <boxGeometry args={[f, h, t]} />
        <meshStandardMaterial color="#3a2e22" roughness={0.7} />
      </mesh>
      <mesh position={[cx + w / 2 + f / 2, h / 2, t / 2]} castShadow>
        <boxGeometry args={[f, h, t]} />
        <meshStandardMaterial color="#3a2e22" roughness={0.7} />
      </mesh>
      <mesh position={[cx, h + f / 2, t / 2]} castShadow>
        <boxGeometry args={[w + 2 * f, f, t]} />
        <meshStandardMaterial color="#3a2e22" roughness={0.7} />
      </mesh>
      <mesh position={[cx, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, 4]} />
        <meshStandardMaterial color="#2a2018" roughness={0.9} />
      </mesh>
    </group>
  );
}
