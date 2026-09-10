import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls } from 'three-stdlib';
import { useStore } from '../store';

/**
 * A press on furniture also used to start OrbitControls rotate. Disable orbit
 * for that press so the same gesture can drag the piece. Re-enable on release.
 * Do not synthesize pointercancel — that aborts DragController / R3F mid-gesture.
 */
export function OrbitPointerGuard() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls) as OrbitControls | null;

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let blockedOrbit = false;

    const hitFurniture = (clientX: number, clientY: number): boolean => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          if (obj.userData?.itemId) return true;
          obj = obj.parent;
        }
      }
      return false;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      if (useStore.getState().captureMode) return;
      if (!hitFurniture(e.clientX, e.clientY)) return;
      if (controls) controls.enabled = false;
      blockedOrbit = true;
    };

    const onUp = () => {
      if (!blockedOrbit) return;
      blockedOrbit = false;
      if (controls) controls.enabled = true;
    };

    canvas.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      canvas.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      if (blockedOrbit && controls) controls.enabled = true;
    };
  }, [camera, controls, gl, scene]);

  return null;
}
