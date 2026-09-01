import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 8;
const LIFT_STEP = 3;

/**
 * Touch long-press on a selected floor item raises elevation by 3″.
 * Mounted with SelectionHud; skips hanging items. Requires a stationary
 * hold — DragController only starts after an 8px move so the lift sticks.
 */
export function LongPressLift() {
  const { camera, gl, scene } = useThree();
  const selectedId = useStore((s) => s.selectedId);
  const captureMode = useStore((s) => s.captureMode);

  const pendingRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    itemId: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  useEffect(() => {
    if (!selectedId || captureMode) return;

    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const clearPending = () => {
      const p = pendingRef.current;
      if (!p) return;
      clearTimeout(p.timer);
      pendingRef.current = null;
    };

    const hitSelectedItemId = (clientX: number, clientY: number): string | null => {
      const { selectedIds, items } = useStore.getState();
      if (selectedIds.length === 0) return null;

      const rect = canvas.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const intersections = raycaster.intersectObjects(scene.children, true);

      for (const ix of intersections) {
        let obj: THREE.Object3D | null = ix.object;
        while (obj) {
          const id = obj.userData?.itemId as string | undefined;
          if (id && selectedIds.includes(id)) {
            const item = items[id];
            if (item && item.kind !== 'hanging') return id;
            return null;
          }
          obj = obj.parent;
        }
      }
      return null;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Touch (and pen) — desktop lift uses Alt+↑ or the HUD handles.
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;

      const itemId = hitSelectedItemId(e.clientX, e.clientY);
      if (!itemId) return;

      clearPending();
      const timer = setTimeout(() => {
        const pending = pendingRef.current;
        if (!pending || pending.pointerId !== e.pointerId) return;
        pendingRef.current = null;
        const item = useStore.getState().items[pending.itemId];
        if (!item || item.kind === 'hanging') return;
        useStore.getState().setItemElevation(item.id, item.position[1] + LIFT_STEP);
      }, LONG_PRESS_MS);

      pendingRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        itemId,
        timer,
      };
    };

    const handlePointerMove = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== e.pointerId) return;
      const dx = e.clientX - pending.startX;
      const dy = e.clientY - pending.startY;
      if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
        clearPending();
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== e.pointerId) return;
      clearPending();
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    return () => {
      clearPending();
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [camera, gl, scene, selectedId, captureMode]);

  return null;
}
