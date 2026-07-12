import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ROOM, DOOR, WINDOW } from '../units';
import { Wall } from './Wall';

/** Short walls (south/north) vs long walls (east/west) — corners use the same tones as {@link Wall}. */
const SHORT_WALL_COLOR = '#d8d0c2';
const LONG_WALL_COLOR = '#cfc7b8';
/** Floor/ceiling caps — midpoint between short and long so horizontal bands stay neutral. */
const CORNER_CAP_COLOR = '#d3cac0';

/**
 * Coordinate convention:
 *   X: 0..ROOM.width (101")  — short dimension (left-right)
 *   Z: 0..ROOM.depth (180")  — long dimension (front-back)
 *   Y: up, 0 at floor
 *
 * Short walls (101" long) are at Z=0 (south, door) and Z=ROOM.depth (north, window).
 * Long walls (180" long) are at X=0 (west) and X=ROOM.width (east).
 */
export function Room() {
  return (
    <group>
      {/* Floor */}
      <mesh
        position={[ROOM.width / 2, 0, ROOM.depth / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshStandardMaterial color="#8b6f4e" roughness={0.85} />
      </mesh>

      {/* South wall (Z=0) — DOOR */}
      <Wall
        length={ROOM.width}
        outwardNormal={[0, 0, -1]}
        innerFaceCenter={[ROOM.width / 2, 0, 0]}
        holes={[{ x: 0, y: 0, w: DOOR.width, h: DOOR.height }]}
        color={SHORT_WALL_COLOR}
      />

      {/* North wall (Z=ROOM.depth) — WINDOW */}
      <Wall
        length={ROOM.width}
        outwardNormal={[0, 0, 1]}
        innerFaceCenter={[ROOM.width / 2, 0, ROOM.depth]}
        holes={[{ x: 0, y: WINDOW.sill, w: WINDOW.width, h: WINDOW.height }]}
        color={SHORT_WALL_COLOR}
      />

      {/* West wall (X=0) */}
      <Wall
        length={ROOM.depth}
        outwardNormal={[-1, 0, 0]}
        innerFaceCenter={[0, 0, ROOM.depth / 2]}
        color={LONG_WALL_COLOR}
      />

      {/* East wall (X=ROOM.width) */}
      <Wall
        length={ROOM.depth}
        outwardNormal={[1, 0, 0]}
        innerFaceCenter={[ROOM.width, 0, ROOM.depth / 2]}
        color={LONG_WALL_COLOR}
      />

      {/* Exterior corner masonry — hides gaps where perpendicular wall slabs meet */}
      <WallCornerVolumes />

      {/* Door frame trim (around the south-wall hole) */}
      <DoorFrame />

      {/* Window glass + frame */}
      <WindowGlass />
    </group>
  );
}

/** Bridges the four exterior wall junctions where extruded slabs would otherwise notch. */
function WallCornerVolumes() {
  const t = ROOM.wallThickness;
  const h = ROOM.height;
  const y = h / 2;
  const W = ROOM.width;
  const D = ROOM.depth;

  const boxGeo = useMemo(() => new THREE.BoxGeometry(t, h, t), [t, h]);

  return (
    <group>
      <WallCornerPost
        geometry={boxGeo}
        position={[-t / 2, y, -t / 2]}
        faceColors={cornerFaceColors.sw}
        shortNormal={[0, 0, -1]}
        longNormal={[-1, 0, 0]}
        fadeOrigin={[0, h / 2, 0]}
      />
      <WallCornerPost
        geometry={boxGeo}
        position={[W + t / 2, y, -t / 2]}
        faceColors={cornerFaceColors.se}
        shortNormal={[0, 0, -1]}
        longNormal={[1, 0, 0]}
        fadeOrigin={[W, h / 2, 0]}
      />
      <WallCornerPost
        geometry={boxGeo}
        position={[-t / 2, y, D + t / 2]}
        faceColors={cornerFaceColors.nw}
        shortNormal={[0, 0, 1]}
        longNormal={[-1, 0, 0]}
        fadeOrigin={[0, h / 2, D]}
      />
      <WallCornerPost
        geometry={boxGeo}
        position={[W + t / 2, y, D + t / 2]}
        faceColors={cornerFaceColors.ne}
        shortNormal={[0, 0, 1]}
        longNormal={[1, 0, 0]}
        fadeOrigin={[W, h / 2, D]}
      />
    </group>
  );
}

/**
 * Per-face colors for BoxGeometry materials order: +X, -X, +Y, -Y, +Z, -Z.
 * Each outward-facing side matches the adjacent wall slab color; coplanar inner faces match the wall they continue.
 */
const cornerFaceColors = {
  sw: [SHORT_WALL_COLOR, LONG_WALL_COLOR, CORNER_CAP_COLOR, CORNER_CAP_COLOR, LONG_WALL_COLOR, SHORT_WALL_COLOR],
  se: [LONG_WALL_COLOR, SHORT_WALL_COLOR, CORNER_CAP_COLOR, CORNER_CAP_COLOR, SHORT_WALL_COLOR, SHORT_WALL_COLOR],
  nw: [SHORT_WALL_COLOR, LONG_WALL_COLOR, CORNER_CAP_COLOR, CORNER_CAP_COLOR, SHORT_WALL_COLOR, LONG_WALL_COLOR],
  ne: [LONG_WALL_COLOR, SHORT_WALL_COLOR, CORNER_CAP_COLOR, CORNER_CAP_COLOR, SHORT_WALL_COLOR, LONG_WALL_COLOR],
} as const;

interface WallCornerPostProps {
  geometry: THREE.BoxGeometry;
  position: [number, number, number];
  faceColors: readonly [string, string, string, string, string, string];
  shortNormal: [number, number, number];
  longNormal: [number, number, number];
  fadeOrigin: [number, number, number];
}

/** One corner volume: same physical dimensions as before, multi-material box + same exterior fade logic as {@link Wall}. */
function WallCornerPost({
  geometry,
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

    // Face tint follows short vs long wall assignment in faceColors order sw/ne etc.
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

function DoorFrame() {
  // Door hole is centered along the south wall (Z=0).
  const cx = ROOM.width / 2;
  const w = DOOR.width;
  const h = DOOR.height;
  const t = 2; // trim thickness (along Z)
  const f = 1.5; // trim face width
  return (
    <group>
      {/* left jamb */}
      <mesh position={[cx - w / 2 - f / 2, h / 2, t / 2]} castShadow>
        <boxGeometry args={[f, h, t]} />
        <meshStandardMaterial color="#3a2e22" roughness={0.7} />
      </mesh>
      {/* right jamb */}
      <mesh position={[cx + w / 2 + f / 2, h / 2, t / 2]} castShadow>
        <boxGeometry args={[f, h, t]} />
        <meshStandardMaterial color="#3a2e22" roughness={0.7} />
      </mesh>
      {/* head */}
      <mesh position={[cx, h + f / 2, t / 2]} castShadow>
        <boxGeometry args={[w + 2 * f, f, t]} />
        <meshStandardMaterial color="#3a2e22" roughness={0.7} />
      </mesh>
      {/* threshold floor strip */}
      <mesh position={[cx, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, 4]} />
        <meshStandardMaterial color="#2a2018" roughness={0.9} />
      </mesh>
    </group>
  );
}

function WindowGlass() {
  // Window is on north wall (Z = ROOM.depth)
  const cx = ROOM.width / 2;
  const cy = WINDOW.sill + WINDOW.height / 2;
  const cz = ROOM.depth;
  return (
    <group>
      {/* glass */}
      <mesh position={[cx, cy, cz - 0.1]}>
        <planeGeometry args={[WINDOW.width - 1, WINDOW.height - 1]} />
        <meshPhysicalMaterial
          color="#a8c8e8"
          roughness={0.05}
          transmission={0.85}
          thickness={0.5}
          transparent
          opacity={0.4}
        />
      </mesh>
      {/* frame trim */}
      <mesh position={[cx, WINDOW.sill - 0.75, cz - 1]}>
        <boxGeometry args={[WINDOW.width + 3, 1.5, 2]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[cx, WINDOW.sill + WINDOW.height + 0.75, cz - 1]}>
        <boxGeometry args={[WINDOW.width + 3, 1.5, 2]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[cx - WINDOW.width / 2 - 0.75, cy, cz - 1]}>
        <boxGeometry args={[1.5, WINDOW.height, 2]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[cx + WINDOW.width / 2 + 0.75, cy, cz - 1]}>
        <boxGeometry args={[1.5, WINDOW.height, 2]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
    </group>
  );
}
