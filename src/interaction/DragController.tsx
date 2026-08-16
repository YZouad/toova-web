import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';
import { validatePlacement, clampToRoom, settleGravity, isTouchingWall } from './collision';

/**
 * Left-drag moves the selected item(s) in XZ while keeping each item's height.
 * When multiple items are selected, dragging any one moves the whole set by the
 * same delta (all-or-nothing collision).
 *
 * Wall mount (+ touching wall): release keeps height; only invalid XZ snaps back.
 * Otherwise: gravity on release — settles on floor or top of nearest support below.
 */
export function DragController() {
  const { camera, gl, scene } = useThree();
  const controls = useThree((s) => s.controls) as any;

  const draggingRef = useRef<{
    ids: string[];
    primaryId: string;
    grabOffset: THREE.Vector3;
    baseY: number;
    startPositions: Record<string, [number, number, number]>;
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
      // Shift is reserved for multi-select toggles in Selectable.
      if (e.shiftKey) return;
      const { selectedIds, items } = useStore.getState();
      if (selectedIds.length === 0) return;

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
      if (!hitItemId || !selectedIds.includes(hitItemId)) return;

      const primary = items[hitItemId];
      if (!primary || primary.kind === 'hanging') return;

      const movableIds = selectedIds.filter((id) => {
        const it = items[id];
        return !!it && it.kind !== 'hanging';
      });
      if (!movableIds.includes(hitItemId)) return;

      const start = screenToPlane(e.clientX, e.clientY, primary.position[1]);
      if (!start) return;

      const startPositions: Record<string, [number, number, number]> = {};
      for (const id of movableIds) {
        const it = items[id];
        if (it) startPositions[id] = [...it.position];
      }

      draggingRef.current = {
        ids: movableIds,
        primaryId: hitItemId,
        grabOffset: new THREE.Vector3(primary.position[0] - start.x, 0, primary.position[2] - start.z),
        baseY: primary.position[1],
        startPositions,
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
      const primary = state.items[drag.primaryId];
      const primaryStart = drag.startPositions[drag.primaryId];
      if (!primary || !primaryStart) return;

      const [pcx, pcz] = clampToRoom(
        primary,
        planeHit.x + drag.grabOffset.x,
        planeHit.z + drag.grabOffset.z,
      );
      const dx = pcx - primaryStart[0];
      const dz = pcz - primaryStart[2];

      const moving = new Set(drag.ids);
      const others = Object.values(state.items).filter((it) => !moving.has(it.id));
      const proposed: Record<string, [number, number, number]> = {};
      let allOk = true;

      for (const id of drag.ids) {
        const it = state.items[id];
        const start = drag.startPositions[id];
        if (!it || !start) {
          allOk = false;
          break;
        }
        const [cx, cz] = clampToRoom(it, start[0] + dx, start[2] + dz);
        const pos: [number, number, number] = [cx, start[1], cz];
        if (!validatePlacement({ ...it, position: pos }, others).ok) {
          allOk = false;
          break;
        }
        proposed[id] = pos;
      }

      if (allOk) {
        useStore.getState().updatePositions(proposed);
        useStore.getState().setInvalid(false);
      } else {
        useStore.getState().setInvalid(true);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;

      const state = useStore.getState();
      const moving = new Set(drag.ids);
      const settled: Record<string, [number, number, number]> = {};

      for (const id of drag.ids) {
        const item = state.items[id];
        const startPos = drag.startPositions[id];
        if (!item || !startPos) continue;

        const others = [
          ...Object.values(state.items).filter((it) => !moving.has(it.id)),
          ...Object.entries(settled).map(([sid, position]) => ({
            ...state.items[sid]!,
            position,
          })),
        ];

        const pinHeight = item.kind === 'light' || !!(item.wallMounted && isTouchingWall(item));
        if (pinHeight) {
          if (!validatePlacement(item, others).ok) {
            settled[id] = startPos;
          } else {
            settled[id] = [...item.position];
          }
        } else {
          const settledY = settleGravity(item, others, item.position[1]);
          let pos: [number, number, number] = [item.position[0], settledY, item.position[2]];
          if (!validatePlacement({ ...item, position: pos }, others).ok) {
            pos = [startPos[0], settledY, startPos[2]];
            if (!validatePlacement({ ...item, position: pos }, others).ok) {
              pos = startPos;
            }
          }
          settled[id] = pos;
        }
      }

      if (Object.keys(settled).length > 0) {
        useStore.getState().updatePositions(settled);
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
