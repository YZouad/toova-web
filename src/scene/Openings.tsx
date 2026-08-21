import { useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  doorOpenings,
  openingWorldPlacement,
  type RoomGeometry,
} from '../lib/roomGeometry';
import { getProceduralMaterialMaps } from '../lib/proceduralTextures';
import type { MaterialPresetId } from '../lib/roomMaterials';
import { useOrbitFade } from './useOrbitFade';
import { SHADOW_ONLY_LAYER } from './shadowLayers';

/**
 * Door casing, leaf, threshold, and handle — fades with its host wall in orbit mode.
 */
export function DoorAssemblies({
  geom,
  trimPreset,
}: {
  geom: RoomGeometry;
  trimPreset: MaterialPresetId;
}) {
  const doors = doorOpenings(geom);

  return (
    <group>
      {doors.map((door) => {
        const p = openingWorldPlacement(geom, door);
        if (!p) return null;
        return (
          <DoorUnit
            key={door.id}
            placement={p}
            hinge={door.hinge === 'left' ? 'left' : 'right'}
            trimPreset={trimPreset}
          />
        );
      })}
    </group>
  );
}

function DoorUnit({
  placement,
  hinge,
  trimPreset,
}: {
  placement: NonNullable<ReturnType<typeof openingWorldPlacement>>;
  hinge: 'left' | 'right';
  trimPreset: MaterialPresetId;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const trimRef = useRef<THREE.MeshStandardMaterial>(null!);
  const leafRef = useRef<THREE.MeshStandardMaterial>(null!);
  const handleRef = useRef<THREE.MeshStandardMaterial>(null!);

  const trimMat = useMemo(() => {
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

  const leafMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#f2efe8',
        roughness: 0.55,
        metalness: 0,
        transparent: true,
      }),
    [],
  );
  const handleMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#c0c4c8',
        roughness: 0.35,
        metalness: 0.85,
        transparent: true,
      }),
    [],
  );

  useEffect(() => {
    trimRef.current = trimMat;
    leafRef.current = leafMat;
    handleRef.current = handleMat;
    return () => {
      trimMat.dispose();
      leafMat.dispose();
      handleMat.dispose();
    };
  }, [trimMat, leafMat, handleMat]);

  const center: [number, number, number] = [placement.cx, placement.h / 2, placement.cz];
  useOrbitFade([trimRef, leafRef, handleRef], placement.outward, center, { groupRef });

  const w = placement.w;
  const h = placement.h;
  const jamb = 1.5;
  const depth = 3.5;
  const leafGap = 0.4;
  const leafT = 1.4;
  const hingeSign = hinge === 'left' ? -1 : 1;
  const openAngle = -hingeSign * 0.35;

  return (
    <group
      ref={groupRef}
      position={[placement.cx, 0, placement.cz]}
      rotation={[0, placement.rotationY, 0]}
    >
      <mesh position={[-w / 2 - jamb / 2, h / 2, depth / 2]} castShadow material={trimMat}>
        <boxGeometry args={[jamb, h, depth]} />
      </mesh>
      <mesh position={[w / 2 + jamb / 2, h / 2, depth / 2]} castShadow material={trimMat}>
        <boxGeometry args={[jamb, h, depth]} />
      </mesh>
      <mesh position={[0, h + jamb / 2, depth / 2]} castShadow material={trimMat}>
        <boxGeometry args={[w + 2 * jamb, jamb, depth]} />
      </mesh>
      <mesh position={[0, 0.4, depth / 2]} castShadow receiveShadow material={trimMat}>
        <boxGeometry args={[w + 2 * jamb, 0.8, depth + 1]} />
      </mesh>
      <group
        position={[hingeSign * (w / 2 - leafGap), 0, depth * 0.35]}
        rotation={[0, openAngle, 0]}
      >
        <mesh
          position={[-hingeSign * ((w - leafGap * 2) / 2), h / 2, 0]}
          castShadow
          receiveShadow
          material={leafMat}
        >
          <boxGeometry args={[w - leafGap * 2, h - 1, leafT]} />
        </mesh>
        <mesh
          position={[-hingeSign * ((w - leafGap * 2) / 2), h * 0.55, leafT * 0.55]}
          material={leafMat}
        >
          <boxGeometry args={[(w - leafGap * 2) * 0.7, h * 0.55, 0.15]} />
        </mesh>
        <mesh
          position={[-hingeSign * ((w - leafGap * 2) * 0.78), 36, leafT * 0.7]}
          castShadow
          material={handleMat}
        >
          <cylinderGeometry args={[0.45, 0.45, 3.2, 12]} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Window frame, sill, mullions, and glass.
 */
export function WindowAssemblies({
  geom,
  trimPreset,
  glassTint,
  fillIntensity,
  castWindowShadows = false,
}: {
  geom: RoomGeometry;
  trimPreset: MaterialPresetId;
  glassTint: string;
  fillIntensity: number;
  /** When Shadow roof blocks overhead sun, window spots cast furniture shadows. */
  castWindowShadows?: boolean;
}) {
  const windows = geom.openings.filter((o) => o.kind === 'window');

  return (
    <group>
      {windows.map((win, i) => {
        const p = openingWorldPlacement(geom, win);
        if (!p) return null;
        return (
          <WindowUnit
            key={win.id}
            placement={p}
            sill={win.sill ?? 36}
            trimPreset={trimPreset}
            glassTint={glassTint}
            fillIntensity={fillIntensity}
            castShadows={castWindowShadows && i === 0}
          />
        );
      })}
    </group>
  );
}

function WindowUnit({
  placement,
  sill,
  trimPreset,
  glassTint,
  fillIntensity,
  castShadows = false,
}: {
  placement: NonNullable<ReturnType<typeof openingWorldPlacement>>;
  sill: number;
  trimPreset: MaterialPresetId;
  glassTint: string;
  fillIntensity: number;
  castShadows?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const trimRef = useRef<THREE.MeshStandardMaterial>(null!);
  const glassRef = useRef<THREE.MeshPhysicalMaterial>(null!);

  const trimMat = useMemo(() => {
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

  const glassMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: glassTint,
        roughness: 0.05,
        transmission: 0.9,
        thickness: 0.4,
        transparent: true,
        opacity: 0.35,
        metalness: 0,
      }),
    [glassTint],
  );

  useEffect(() => {
    trimRef.current = trimMat;
    glassRef.current = glassMat;
    return () => {
      trimMat.dispose();
      glassMat.dispose();
    };
  }, [trimMat, glassMat]);

  const center: [number, number, number] = [placement.cx, placement.cy, placement.cz];
  useOrbitFade([trimRef, glassRef], placement.outward, center, { groupRef });

  const w = placement.w;
  const h = placement.h;
  const frame = 1.6;
  const depth = 3.2;

  return (
    <group ref={groupRef}>
      <group position={[placement.cx, 0, placement.cz]} rotation={[0, placement.rotationY, 0]}>
        <mesh position={[-w / 2 - frame / 2, sill + h / 2, depth / 2]} castShadow material={trimMat}>
          <boxGeometry args={[frame, h + frame * 2, depth]} />
        </mesh>
        <mesh position={[w / 2 + frame / 2, sill + h / 2, depth / 2]} castShadow material={trimMat}>
          <boxGeometry args={[frame, h + frame * 2, depth]} />
        </mesh>
        <mesh position={[0, sill - frame / 2, depth / 2]} castShadow receiveShadow material={trimMat}>
          <boxGeometry args={[w + frame * 2, frame, depth + 1.5]} />
        </mesh>
        <mesh position={[0, sill + h + frame / 2, depth / 2]} castShadow material={trimMat}>
          <boxGeometry args={[w + frame * 2, frame, depth]} />
        </mesh>
        <mesh position={[0, sill + h / 2, depth * 0.55]} castShadow material={trimMat}>
          <boxGeometry args={[0.9, h - 1, 1.2]} />
        </mesh>
        <mesh position={[0, sill + h / 2, depth * 0.55]} castShadow material={trimMat}>
          <boxGeometry args={[w - 1, 0.9, 1.2]} />
        </mesh>
        <mesh position={[-w / 4, sill + h / 2, depth * 0.4]} material={glassMat}>
          <planeGeometry args={[w / 2 - 1.5, h - 2]} />
        </mesh>
        <mesh position={[w / 4, sill + h / 2, depth * 0.4]} material={glassMat}>
          <planeGeometry args={[w / 2 - 1.5, h - 2]} />
        </mesh>
      </group>
      <WindowFillLight
        placement={placement}
        color={glassTint}
        intensity={fillIntensity}
        castShadows={castShadows}
      />
    </group>
  );
}

function WindowFillLight({
  placement,
  color,
  intensity,
  castShadows = false,
}: {
  placement: { cx: number; cy: number; cz: number; outward: [number, number, number]; w?: number; h?: number };
  color: string;
  intensity: number;
  castShadows?: boolean;
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
    if (castShadows && light?.shadow?.camera) {
      light.shadow.camera.layers.enable(0);
      light.shadow.camera.layers.enable(SHADOW_ONLY_LAYER);
    }
  }, [castShadows]);

  return (
    <>
      <spotLight
        ref={lightRef}
        position={outside}
        color={color}
        intensity={intensity * (castShadows ? 1.1 : 0.65)}
        angle={Math.PI / 3.2}
        penumbra={0.55}
        distance={400}
        decay={1.6}
        castShadow={castShadows}
        shadow-mapSize={castShadows ? [1024, 1024] : [512, 512]}
        shadow-bias={-0.0002}
        shadow-normalBias={1}
      />
      <object3D ref={targetRef} position={inside} />
    </>
  );
}
