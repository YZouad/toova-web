import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';
import { validatePlacement, clampToRoom, settleGravity, isTouchingWall } from './collision';

/**
 * Left-drag moves the selected item in XZ while keeping its current height.
 *
 * Wall mount (+ touching wall): release keeps height; only invalid XZ snaps back.
 * Otherwise: gravity on release — settles on floor or top of nearest support below.
 */
export function DragController() {
  const { camera, gl, scene } = useThree();
  const controls = useThree((s) => s.controls) as any;

  const draggingRef = useRef<{
    id: string;
    grabOffset: THREE.Vector3;
    baseY: number;
    startPosition: [number, number, number];
  } | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    const screenToPlane = (clientX: number, clientY: number, planeY: number): THREE.Vector3 | null => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      dragPlane.constant = -planeY;
      return raycaster.ray.intersectPlane(dragPlane, hit) ? hit.clone() : null;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const { selectedId, items } = useStore.getState();
      if (!selectedId) return;
      const item = items[selectedId];
      if (!item) return;

      const canvasRect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
      ndc.y = -((e.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const intersections = raycaster.intersectObjects(scene.children, true);

      let hitItemId: string | null = null;
      for (const ix of intersections) {
        let obj: THREE.Object3D | null = ix.object;
        while (obj) {
          if (obj.userData?.itemId) { hitItemId = obj.userData.itemId as string; break; }
          obj = obj.parent;
        }
        if (hitItemId) break;
      }
      if (hitItemId !== selectedId) return;

      const start = screenToPlane(e.clientX, e.clientY, item.position[1]);
      if (!start) return;

      draggingRef.current = {
        id: selectedId,
        grabOffset: new THREE.Vector3(item.position[0] - start.x, 0, item.position[2] - start.z),
        baseY: item.position[1],
        startPosition: [...item.position],
      };

      if (controls) controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const handlePointerMove = (e: PointerEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;

      const planeHit = screenToPlane(e.clientX, e.clientY, drag.baseY);
      if (!planeHit) return;

      const state = useStore.getState();
      const item = state.items[drag.id];
      if (!item) return;

      const [cx, cz] = clampToRoom(item, planeHit.x + drag.grabOffset.x, planeHit.z + drag.grabOffset.z);
      const proposed: [number, number, number] = [cx, drag.baseY, cz];
      const candidate = { ...item, position: proposed };
      const others = Object.values(state.items).filter((it) => it.id !== drag.id);

      if (validatePlacement(candidate, others).ok) {
        useStore.getState().updatePosition(drag.id, proposed);
        useStore.getState().setInvalid(false);
      } else {
        useStore.getState().setInvalid(true);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;

      const state = useStore.getState();
      const item = state.items[drag.id];
      if (item) {
        const others = Object.values(state.items).filter((it) => it.id !== drag.id);

        const pinToWall = !!(item.wallMounted && isTouchingWall(item));
        if (pinToWall) {
          if (!validatePlacement(item, others).ok) {
            useStore.getState().updatePosition(drag.id, drag.startPosition);
          }
        } else {
          const settledY = settleGravity(item, others, item.position[1]);
          const settled: [number, number, number] = [item.position[0], settledY, item.position[2]];
          const ok = validatePlacement({ ...item, position: settled }, others).ok;
          useStore.getState().updatePosition(drag.id, ok ? settled : drag.startPosition);
        }
      }

      draggingRef.current = null;
      useStore.getState().setInvalid(false);
      if (controls) controls.enabled = true;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [camera, gl, scene, controls]);

  return null;
}
