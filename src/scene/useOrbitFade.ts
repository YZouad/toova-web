import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';

/**
 * Orbit-cutaway fade: surfaces whose outward normal faces the camera become
 * transparent so you can look into the room.
 *
 * Color opacity is for viewing only. Casters should use an opaque
 * `customDepthMaterial` so sunlight still blocked while the wall is faded.
 */
export function useOrbitFade(
  matRefs: Array<React.RefObject<THREE.Material | null> | React.MutableRefObject<THREE.Material | null>>,
  outwardNormal: [number, number, number],
  center: [number, number, number],
  opts?: {
    groupRef?: React.RefObject<THREE.Object3D | null>;
    hidden?: boolean;
  },
): void {
  const cutaway = useStore((s) => s.visual.cutaway);
  const allowFade = cutaway === 'orbit';
  const temps = useRef({
    worldNormal: new THREE.Vector3(),
    toCamera: new THREE.Vector3(),
    center: new THREE.Vector3(),
  }).current;

  useFrame(({ camera }) => {
    if (opts?.hidden) {
      if (opts.groupRef?.current) opts.groupRef.current.visible = false;
      return;
    }
    if (opts?.groupRef?.current) opts.groupRef.current.visible = true;

    let targetOpacity = 1;
    if (allowFade) {
      temps.worldNormal.set(outwardNormal[0], outwardNormal[1], outwardNormal[2]).normalize();
      temps.center.set(center[0], center[1], center[2]);
      temps.toCamera.subVectors(camera.position, temps.center).normalize();
      const facing = temps.toCamera.dot(temps.worldNormal);
      targetOpacity = facing > 0.05 ? Math.max(0, 1 - facing * 2.8) : 1;
    }

    for (const ref of matRefs) {
      const mat = ref.current;
      if (!mat || !('opacity' in mat)) continue;
      const m = mat as THREE.MeshStandardMaterial;
      const next = THREE.MathUtils.lerp(m.opacity, targetOpacity, 0.45);
      m.opacity = Math.abs(next - targetOpacity) < 0.02 ? targetOpacity : next;
      const wasTransparent = m.transparent;
      const wantTransparent = allowFade || m.opacity < 0.999;
      m.transparent = wantTransparent;
      m.depthWrite = m.opacity > 0.92;
      if (wasTransparent !== m.transparent) m.needsUpdate = true;
    }
  }, 1);
}

/** True when orbit-fade cutaway is active (SSAO should stay off — transparent walls break it). */
export function useOrbitFadeActive(): boolean {
  return useStore((s) => s.visual.cutaway === 'orbit');
}
