import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getOrbitHiddenWallIds,
  orbitHiddenIdsEqual,
  pickOrbitHiddenWallIds,
  setOrbitHiddenWallIds,
} from '../lib/orbitCutaway';
import { allWallSegments, planCentroid, type RoomGeometry } from '../lib/roomGeometry';
import { useStore } from '../store';

/** Stops Raycaster recursion into children (scene-rooted picks). */
function blockGroupRaycast(): false {
  return false;
}

/**
 * Orbit cutaway: hide surfaces whose outward normal faces the camera.
 * We hide (no transparency) so furniture is never composited through a
 * see-through wall — that path punched black holes in imported meshes.
 *
 * Walls pass `wallId` so hide is decided per segment (position + orientation),
 * not per shared facing bucket. Ceilings omit `wallId` and keep the facing test.
 *
 * R3F raycasts interactive meshes directly, so Wall.tsx also drops its
 * pointer handler while orbit-hidden (via orbitHiddenWallIds in the store).
 */
export function useOrbitFade(
  matRefs: Array<React.RefObject<THREE.Material | null> | React.MutableRefObject<THREE.Material | null>>,
  outwardNormal: [number, number, number],
  center: [number, number, number],
  opts?: {
    groupRef?: React.RefObject<THREE.Object3D | null>;
    hidden?: boolean;
    wallId?: string;
  },
): void {
  const cutaway = useStore((s) => s.visual.cutaway);
  const allowFade = cutaway === 'orbit';
  const temps = useRef({
    worldNormal: new THREE.Vector3(),
    toCamera: new THREE.Vector3(),
    center: new THREE.Vector3(),
  }).current;
  const lastPickable = useRef<boolean | null>(null);
  const lastGroup = useRef<THREE.Object3D | null>(null);

  useFrame(({ camera }) => {
    const group = opts?.groupRef?.current ?? null;
    if (group !== lastGroup.current) {
      lastGroup.current = group;
      lastPickable.current = null;
    }

    if (opts?.hidden) {
      if (group) {
        group.visible = false;
        if (lastPickable.current !== false) {
          group.raycast = blockGroupRaycast;
          lastPickable.current = false;
        }
      }
      return;
    }

    let hide = false;
    if (allowFade) {
      if (opts?.wallId) {
        hide = getOrbitHiddenWallIds().has(opts.wallId);
      } else {
        temps.worldNormal.set(outwardNormal[0], outwardNormal[1], outwardNormal[2]).normalize();
        temps.center.set(center[0], center[1], center[2]);
        temps.toCamera.subVectors(camera.position, temps.center).normalize();
        const facing = temps.toCamera.dot(temps.worldNormal);
        hide = facing > 0.18;
      }
    }

    if (group) {
      group.visible = !hide;
      group.renderOrder = 0;
      const pickable = !hide;
      if (lastPickable.current !== pickable) {
        group.raycast = pickable
          ? THREE.Object3D.prototype.raycast
          : blockGroupRaycast;
        lastPickable.current = pickable;
      }
    }

    for (const ref of matRefs) {
      const mat = ref.current;
      if (!mat || !('opacity' in mat)) continue;
      const m = mat as THREE.MeshStandardMaterial;
      if (m.opacity !== 1 || m.transparent) {
        m.opacity = 1;
        m.transparent = false;
        m.depthWrite = true;
        m.needsUpdate = true;
      }
    }
  }, 1);
}

/** True when orbit-fade cutaway is active (SSAO should stay off — hidden walls break it). */
export function useOrbitFadeActive(): boolean {
  return useStore((s) => s.visual.cutaway === 'orbit');
}

/** Runs before wall fades (priority 0) so every segment sees the same hidden set. */
export function OrbitCutawaySync({ geom }: { geom: RoomGeometry }) {
  const cutaway = useStore((s) => s.visual.cutaway);
  const setStoreHidden = useStore((s) => s.setOrbitHiddenWallIds);
  const walls = useMemo(
    () =>
      allWallSegments(geom).map((s) => ({
        id: s.wall.id,
        innerFaceCenter: s.innerFaceCenter,
        outward: s.outward,
      })),
    [geom],
  );
  const centroid = useMemo(() => {
    const [x, z] = planCentroid(geom);
    return { x, z };
  }, [geom]);

  useFrame(({ camera }) => {
    if (cutaway !== 'orbit') {
      setOrbitHiddenWallIds(new Set());
      if (useStore.getState().orbitHiddenWallIds.length > 0) {
        setStoreHidden([]);
      }
      return;
    }
    const next = pickOrbitHiddenWallIds(walls, camera.position, centroid);
    const prev = getOrbitHiddenWallIds();
    if (orbitHiddenIdsEqual(prev, next)) return;
    setOrbitHiddenWallIds(next);
    setStoreHidden([...next].sort());
  }, 0);

  return null;
}
