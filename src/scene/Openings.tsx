import { useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { getOrbitHiddenWallIds } from '../lib/orbitCutaway';
import {
  doorOpenings,
  openingWorldPlacement,
  type RoomGeometry,
} from '../lib/roomGeometry';
import { getProceduralMaterialMaps } from '../lib/proceduralTextures';
import type { MaterialPresetId } from '../lib/roomMaterials';
import { ROOM } from '../units';
import { useOrbitFade } from './useOrbitFade';
import { SHADOW_ONLY_LAYER } from './shadowLayers';
import { dollhouseClipPlanes } from './dollhouseClip';
import { useStore } from '../store';

const WINDOW_CLICK_PX = 6;

/** Shared paint for the door leaf (also used by dollhouse caps). */
export const DOOR_LEAF_COLOR = '#f2efe8';

export type DoorPartBox = {
  kind: 'leftJamb' | 'rightJamb' | 'head' | 'threshold' | 'leaf' | 'panel' | 'handle';
  /** Local center relative to the opening origin (inner face, door midpoint). */
  center: [number, number, number];
  size: [number, number, number];
};

export type DoorPartLayout = {
  boxes: DoorPartBox[];
  /** Hinge-group origin in local door space. */
  hinge: [number, number, number];
  openAngle: number;
  hingeSign: number;
};

/**
 * Local door parts with Z centered in the wall slab.
 * Opening origin is the wall's inner face (local Z=0 into the room); the wall
 * occupies Z ∈ [-thickness, 0]. Parts sit at Z = -T/2 so they fill the hole
 * instead of standing as fins inside the room.
 */
export function doorPartBoxes(
  w: number,
  h: number,
  thickness: number = ROOM.wallThickness,
  hinge: 'left' | 'right' = 'right',
  closed = false,
): DoorPartLayout {
  const jamb = 1.5;
  const leafGap = 0.4;
  const leafT = 1.4;
  const floorClear = 0.35;
  const thresholdH = 0.5;
  const thresholdBottom = 0.05;
  const zMid = -thickness / 2;
  const jambDepth = thickness + 0.2;
  const jambH = h - floorClear;
  const jambCy = floorClear + jambH / 2;
  const leafH = h - 1 - floorClear;
  const leafCy = floorClear + 0.5 + leafH / 2;
  const hingeSign = hinge === 'left' ? -1 : 1;
  const openAngle = closed ? 0 : -hingeSign * 0.35;
  const leafW = w - leafGap * 2;
  const hingePivot: [number, number, number] = [hingeSign * (w / 2 - leafGap), 0, zMid];
  const leafLocalX = -hingeSign * (leafW / 2);

  const boxes: DoorPartBox[] = [
    {
      kind: 'leftJamb',
      center: [-w / 2 - jamb / 2, jambCy, zMid],
      size: [jamb, jambH, jambDepth],
    },
    {
      kind: 'rightJamb',
      center: [w / 2 + jamb / 2, jambCy, zMid],
      size: [jamb, jambH, jambDepth],
    },
    {
      kind: 'head',
      center: [0, h + jamb / 2, zMid],
      size: [w + 2 * jamb, jamb, jambDepth],
    },
    {
      kind: 'threshold',
      center: [0, thresholdBottom + thresholdH / 2, zMid],
      size: [w + 2 * jamb, thresholdH, thickness],
    },
    {
      kind: 'leaf',
      center: [leafLocalX, leafCy, 0],
      size: [leafW, leafH, leafT],
    },
    {
      kind: 'panel',
      center: [leafLocalX, h * 0.55, leafT * 0.55],
      size: [leafW * 0.7, h * 0.55, 0.15],
    },
    {
      kind: 'handle',
      center: [-hingeSign * (leafW * 0.78), 36, leafT * 0.7],
      size: [0.9, 3.2, 0.9],
    },
  ];

  return { boxes, hinge: hingePivot, openAngle, hingeSign };
}

/**
 * Door casing, leaf, threshold, and handle — fades with its host wall in orbit mode.
 */
export function DoorAssemblies({
  geom,
  trimPreset,
  closed = false,
}: {
  geom: RoomGeometry;
  trimPreset: MaterialPresetId;
  /** Closed leaves for the dollhouse overview (no swing into corridors). */
  closed?: boolean;
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
            closed={closed}
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
  closed = false,
}: {
  placement: NonNullable<ReturnType<typeof openingWorldPlacement>>;
  hinge: 'left' | 'right';
  trimPreset: MaterialPresetId;
  closed?: boolean;
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
      clippingPlanes: dollhouseClipPlanes(),
      clipShadows: true,
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
        color: DOOR_LEAF_COLOR,
        roughness: 0.55,
        metalness: 0,
        transparent: true,
        clippingPlanes: dollhouseClipPlanes(),
        clipShadows: true,
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
        clippingPlanes: dollhouseClipPlanes(),
        clipShadows: true,
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
  useOrbitFade([trimRef, leafRef, handleRef], placement.outward, center, {
    groupRef,
    wallId: placement.opening.wallId,
  });

  const layout = useMemo(
    () => doorPartBoxes(placement.w, placement.h, ROOM.wallThickness, hinge, closed),
    [placement.w, placement.h, hinge, closed],
  );
  const byKind = (kind: DoorPartBox['kind']) => layout.boxes.find((b) => b.kind === kind)!;

  const leftJamb = byKind('leftJamb');
  const rightJamb = byKind('rightJamb');
  const head = byKind('head');
  const threshold = byKind('threshold');
  const leaf = byKind('leaf');
  const panel = byKind('panel');
  const handle = byKind('handle');

  return (
    <group
      ref={groupRef}
      position={[placement.cx, 0, placement.cz]}
      rotation={[0, placement.rotationY, 0]}
    >
      <mesh position={leftJamb.center} castShadow material={trimMat}>
        <boxGeometry args={leftJamb.size} />
      </mesh>
      <mesh position={rightJamb.center} castShadow material={trimMat}>
        <boxGeometry args={rightJamb.size} />
      </mesh>
      <mesh position={head.center} castShadow material={trimMat}>
        <boxGeometry args={head.size} />
      </mesh>
      {/* No sun shadow — a thin sill picks up sawtooth shadow-map edges. */}
      <mesh position={threshold.center} material={trimMat}>
        <boxGeometry args={threshold.size} />
      </mesh>
      <group position={layout.hinge} rotation={[0, layout.openAngle, 0]}>
        <mesh position={leaf.center} castShadow receiveShadow material={leafMat}>
          <boxGeometry args={leaf.size} />
        </mesh>
        <mesh position={panel.center} material={leafMat}>
          <boxGeometry args={panel.size} />
        </mesh>
        <mesh position={handle.center} castShadow material={handleMat}>
          <cylinderGeometry args={[0.45, 0.45, handle.size[1], 12]} />
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
  interactive = false,
  fillLights = true,
}: {
  geom: RoomGeometry;
  trimPreset: MaterialPresetId;
  glassTint: string;
  fillIntensity: number;
  /** When Shadow roof blocks overhead sun, window spots cast furniture shadows. */
  castWindowShadows?: boolean;
  interactive?: boolean;
  /** Per-window spotlights. Off in apartment shells — lights live in ApartmentWindowLights. */
  fillLights?: boolean;
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
            interactive={interactive}
            fillLights={fillLights}
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
  interactive = false,
  fillLights = true,
}: {
  placement: NonNullable<ReturnType<typeof openingWorldPlacement>>;
  sill: number;
  trimPreset: MaterialPresetId;
  glassTint: string;
  fillIntensity: number;
  castShadows?: boolean;
  interactive?: boolean;
  fillLights?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const pendingClick = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const designerTool = useStore((s) => s.designerTool);
  const selectedOpeningId = useStore((s) => s.selectedOpeningId);
  const selectOpening = useStore((s) => s.selectOpening);
  const openingId = placement.opening.id;
  const wallId = placement.opening.wallId;
  const selected = selectedOpeningId === openingId;
  const canSelect = interactive && designerTool === 'select';
  const trimRef = useRef<THREE.MeshStandardMaterial>(null!);
  const glassRef = useRef<THREE.MeshPhysicalMaterial>(null!);
  const curtainRef = useRef<THREE.MeshStandardMaterial>(null!);
  const rodRef = useRef<THREE.MeshStandardMaterial>(null!);
  const curtains = placement.opening.curtains;

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
      clippingPlanes: dollhouseClipPlanes(),
      clipShadows: true,
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
        clippingPlanes: dollhouseClipPlanes(),
        clipShadows: true,
      }),
    [glassTint],
  );
  const curtainMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: curtains?.color ?? '#d8c4ad',
        roughness: 0.92,
        metalness: 0,
        transparent: true,
        clippingPlanes: dollhouseClipPlanes(),
        clipShadows: true,
      }),
    [curtains?.color],
  );
  const rodMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#74685d',
        roughness: 0.42,
        metalness: 0.7,
        transparent: true,
        clippingPlanes: dollhouseClipPlanes(),
        clipShadows: true,
      }),
    [],
  );

  useEffect(() => {
    trimRef.current = trimMat;
    glassRef.current = glassMat;
    curtainRef.current = curtainMat;
    rodRef.current = rodMat;
    return () => {
      trimMat.dispose();
      glassMat.dispose();
      curtainMat.dispose();
      rodMat.dispose();
    };
  }, [trimMat, glassMat, curtainMat, rodMat]);

  useEffect(() => {
    trimMat.emissive.set(selected ? '#c4a574' : '#000000');
    trimMat.emissiveIntensity = selected ? 0.2 : 0;
  }, [trimMat, selected]);

  const clearPendingClick = () => {
    pendingClick.current = null;
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!canSelect) return;
    if (getOrbitHiddenWallIds().has(wallId)) return;
    const pt = e.nativeEvent.pointerType;
    if (pt === 'touch' || pt === 'pen') return;
    pendingClick.current = {
      pointerId: e.nativeEvent.pointerId,
      x: e.nativeEvent.clientX,
      y: e.nativeEvent.clientY,
    };
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    const pending = pendingClick.current;
    clearPendingClick();
    if (!pending || !canSelect) return;
    if (pending.pointerId !== e.nativeEvent.pointerId) return;
    if (getOrbitHiddenWallIds().has(wallId)) return;
    const dx = e.nativeEvent.clientX - pending.x;
    const dy = e.nativeEvent.clientY - pending.y;
    if (dx * dx + dy * dy > WINDOW_CLICK_PX * WINDOW_CLICK_PX) return;
    e.stopPropagation();
    selectOpening(openingId);
  };

  const center: [number, number, number] = [placement.cx, placement.cy, placement.cz];
  useOrbitFade([trimRef, glassRef, curtainRef, rodRef], placement.outward, center, {
    groupRef,
    wallId: placement.opening.wallId,
  });

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
        {curtains ? (
          <CurtainSet
            width={w}
            height={h}
            sill={sill}
            openness={curtains.openness}
            depth={depth}
            fabricMaterial={curtainMat}
            rodMaterial={rodMat}
          />
        ) : null}
        {canSelect ? (
          <mesh
            position={[0, sill + h / 2, depth * 0.42]}
            userData={{ openingId, wallId }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={clearPendingClick}
            onPointerLeave={clearPendingClick}
          >
            <planeGeometry args={[w + 4, h + 6]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        ) : null}
      </group>
      {fillLights ? (
        <WindowFillLight
          placement={placement}
          color={glassTint}
          intensity={fillIntensity * (curtains ? 0.25 + curtains.openness * 0.75 : 1)}
          castShadows={castShadows}
        />
      ) : null}
    </group>
  );
}

function CurtainSet({
  width,
  height,
  sill,
  openness,
  depth,
  fabricMaterial,
  rodMaterial,
}: {
  width: number;
  height: number;
  sill: number;
  openness: number;
  depth: number;
  fabricMaterial: THREE.MeshStandardMaterial;
  rodMaterial: THREE.MeshStandardMaterial;
}) {
  const rodWidth = width + 14;
  const top = sill + height + 7;
  const bottom = Math.max(2, sill - 5);
  const panelHeight = top - bottom - 1;
  const sideWidth = 5 + (rodWidth / 2 - 5) * (1 - openness);
  const foldCount = 7;
  const foldWidth = (sideWidth / foldCount) * 1.08;

  const panel = (side: -1 | 1) => {
    const outerEdge = side * rodWidth / 2;
    const centerX = outerEdge - side * sideWidth / 2;
    return (
      <group position={[centerX, bottom + panelHeight / 2, depth + 2.7]}>
        {Array.from({ length: foldCount }, (_, i) => {
          const x = -sideWidth / 2 + foldWidth / 2 + i * (sideWidth / foldCount);
          const z = i % 2 === 0 ? 0.65 : 0;
          return (
            <mesh key={i} position={[x, 0, z]} castShadow receiveShadow material={fabricMaterial}>
              <boxGeometry args={[foldWidth, panelHeight, 0.7]} />
            </mesh>
          );
        })}
      </group>
    );
  };

  return (
    <group>
      <mesh position={[0, top + 1.5, depth + 3.3]} rotation={[0, 0, Math.PI / 2]} castShadow material={rodMaterial}>
        <cylinderGeometry args={[0.55, 0.55, rodWidth + 3, 12]} />
      </mesh>
      <mesh position={[-rodWidth / 2 - 2, top + 1.5, depth + 3.3]} rotation={[Math.PI / 2, 0, 0]} material={rodMaterial}>
        <cylinderGeometry args={[1.1, 1.1, 0.7, 12]} />
      </mesh>
      <mesh position={[rodWidth / 2 + 2, top + 1.5, depth + 3.3]} rotation={[Math.PI / 2, 0, 0]} material={rodMaterial}>
        <cylinderGeometry args={[1.1, 1.1, 0.7, 12]} />
      </mesh>
      {panel(-1)}
      {panel(1)}
    </group>
  );
}

/** Exported for ApartmentWindowLights — same spotlight setup as WindowUnit. */
export function WindowFillLight({
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
