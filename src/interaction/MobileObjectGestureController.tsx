import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';
import {
  clampToRoom,
  itemPinsElevation,
  resolveGroupDragDelta,
  settleGravity,
  validatePlacement,
  type DragMover,
} from './collision';

const LONG_PRESS_MS = 450;
const MOVE_START_PX = 8;
const LIFT_PX_PER_INCH = 10;
const PAN_SPEED = 1.15;
const TAP_SELECT_PX = 8;

type PendingTap = {
  kind: 'tap';
  pointerId: number;
  startX: number;
  startY: number;
  itemId: string | null;
};

type PendingObject = {
  kind: 'object';
  pointerId: number;
  startX: number;
  startY: number;
  primaryId: string;
  movableIds: string[];
  timer: ReturnType<typeof setTimeout>;
};

type PendingGesture = PendingTap | PendingObject;

type OrbitLike = {
  enabled: boolean;
  enableRotate?: boolean;
  target: THREE.Vector3;
  object: THREE.Camera;
  update: () => void;
};

export interface MobileObjectGestureControllerProps {
  /** Reports live lift inches while in continuous lift mode. */
  onLiftInchesChange?: (inches: number | null) => void;
}

/**
 * Phone pointer ownership:
 * - 1 finger drag → OrbitControls orbit (selection waits for a short tap)
 * - 1 finger tap → select / deselect item
 * - 2 fingers → our pan + pinch zoom (R3F capture breaks OrbitControls DOLLY_PAN)
 * - 1 finger on selected item → XZ drag / long-press lift
 */
export function MobileObjectGestureController({
  onLiftInchesChange,
}: MobileObjectGestureControllerProps) {
  const { camera, gl, scene } = useThree();
  const controls = useThree((s) => s.controls) as OrbitLike | null | undefined;

  const selectedId = useStore((s) => s.selectedId);
  const captureMode = useStore((s) => s.captureMode);
  const designerTool = useStore((s) => s.designerTool);

  const pendingRef = useRef<PendingGesture | null>(null);

  const dragRef = useRef<{
    pointerId: number;
    ids: string[];
    primaryId: string;
    grabOffset: THREE.Vector3;
    baseY: number;
    startPositions: Record<string, [number, number, number]>;
    lastValid: Record<string, [number, number, number]>;
  } | null>(null);

  const liftRef = useRef<{
    pointerId: number;
    itemId: string;
    startY: number;
    baseElevation: number;
  } | null>(null);

  /** Pointers we have setPointerCapture on — only then handle lostpointercapture. */
  const ourCaptureIds = useRef(new Set<number>());
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const cameraGestureRef = useRef<{
    midX: number;
    midY: number;
    distance: number;
  } | null>(null);

  const panScratch = useRef({
    offset: new THREE.Vector3(),
    pan: new THREE.Vector3(),
    v: new THREE.Vector3(),
  });

  useEffect(() => {
    onLiftInchesChange?.(null);
  }, [selectedId, onLiftInchesChange]);

  useEffect(() => {
    if (captureMode || designerTool !== 'select') return;

    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    const ctrl = () => controls;

    const setOrbitEnabled = (enabled: boolean) => {
      const c = ctrl();
      if (c) c.enabled = enabled;
    };

    const clearPending = () => {
      const p = pendingRef.current;
      if (!p) return;
      if (p.kind === 'object') clearTimeout(p.timer);
      pendingRef.current = null;
    };

    const releaseOurCapture = (pointerId: number) => {
      if (!ourCaptureIds.current.has(pointerId)) return;
      ourCaptureIds.current.delete(pointerId);
      try {
        canvas.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    };

    const capturePointer = (pointerId: number) => {
      ourCaptureIds.current.add(pointerId);
      canvas.setPointerCapture(pointerId);
    };

    const endLift = () => {
      const lift = liftRef.current;
      liftRef.current = null;
      if (lift) releaseOurCapture(lift.pointerId);
      onLiftInchesChange?.(null);
      if (pointersRef.current.size < 2) setOrbitEnabled(true);
    };

    const endDrag = (applyGravity: boolean) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) {
        if (pointersRef.current.size < 2) setOrbitEnabled(true);
        return;
      }
      releaseOurCapture(drag.pointerId);

      if (applyGravity) {
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

          const pinHeight = itemPinsElevation(item);
          const fallback = drag.lastValid[id] ?? startPos;
          if (pinHeight) {
            if (!validatePlacement(item, others).ok) {
              settled[id] = fallback;
            } else {
              settled[id] = [...item.position];
            }
          } else {
            const settledY = settleGravity(item, others, item.position[1]);
            let pos: [number, number, number] = [item.position[0], settledY, item.position[2]];
            if (!validatePlacement({ ...item, position: pos }, others).ok) {
              pos = [fallback[0], settledY, fallback[2]];
              if (!validatePlacement({ ...item, position: pos }, others).ok) {
                pos = fallback;
              }
            }
            settled[id] = pos;
          }
        }

        if (Object.keys(settled).length > 0) {
          useStore.getState().updatePositions(settled);
        }
      }

      useStore.getState().setInvalid(false);
      if (pointersRef.current.size < 2) setOrbitEnabled(true);
    };

    const abortObjectGesture = () => {
      clearPending();
      endDrag(false);
      endLift();
    };

    const panCamera = (deltaX: number, deltaY: number) => {
      const c = ctrl();
      if (!c) return;
      const cam = c.object as THREE.PerspectiveCamera;
      if (!('isPerspectiveCamera' in cam) || !cam.isPerspectiveCamera) return;

      const { offset, pan, v } = panScratch.current;
      offset.copy(cam.position).sub(c.target);
      let targetDistance = offset.length();
      targetDistance *= Math.tan(((cam.fov / 2) * Math.PI) / 180);

      const distLeft = (2 * deltaX * targetDistance * PAN_SPEED) / canvas.clientHeight;
      const distUp = (2 * deltaY * targetDistance * PAN_SPEED) / canvas.clientHeight;

      pan.set(0, 0, 0);
      v.setFromMatrixColumn(cam.matrix, 0).multiplyScalar(-distLeft);
      pan.add(v);
      v.setFromMatrixColumn(cam.matrix, 1).multiplyScalar(distUp);
      pan.add(v);

      cam.position.add(pan);
      c.target.add(pan);
      c.update();
    };

    const dollyCamera = (scale: number) => {
      const c = ctrl();
      if (!c || !(scale > 0) || !Number.isFinite(scale)) return;
      const cam = c.object;
      const { offset } = panScratch.current;
      offset.copy(cam.position).sub(c.target);
      offset.multiplyScalar(scale);
      // Keep within OrbitControls distance band roughly.
      const len = offset.length();
      if (len < 60) offset.setLength(60);
      if (len > 650) offset.setLength(650);
      cam.position.copy(c.target).add(offset);
      c.update();
    };

    const pointerMidDist = () => {
      const pts = [...pointersRef.current.values()];
      if (pts.length < 2) return null;
      const a = pts[0]!;
      const b = pts[1]!;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      return { midX, midY, distance };
    };

    const beginCameraGesture = () => {
      abortObjectGesture();
      setOrbitEnabled(false);
      cameraGestureRef.current = pointerMidDist();
    };

    const endCameraGesture = () => {
      cameraGestureRef.current = null;
      if (!dragRef.current && !liftRef.current) setOrbitEnabled(true);
    };

    const screenToPlane = (clientX: number, clientY: number, planeY: number): THREE.Vector3 | null => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      dragPlane.constant = -planeY;
      return raycaster.ray.intersectPlane(dragPlane, hit) ? hit.clone() : null;
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

    const hitAnyItemId = (clientX: number, clientY: number): string | null => {
      const { items } = useStore.getState();
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const intersections = raycaster.intersectObjects(scene.children, true);
      for (const ix of intersections) {
        let obj: THREE.Object3D | null = ix.object;
        while (obj) {
          const id = obj.userData?.itemId as string | undefined;
          if (id && items[id]) return id;
          obj = obj.parent;
        }
      }
      return null;
    };

    const isTapMovement = (dx: number, dy: number) =>
      dx * dx + dy * dy < TAP_SELECT_PX * TAP_SELECT_PX;

    const beginDrag = (e: PointerEvent, primaryId: string, movableIds: string[]) => {
      if (pointersRef.current.size > 1) return;
      const { items } = useStore.getState();
      const primary = items[primaryId];
      if (!primary) return;
      const start = screenToPlane(e.clientX, e.clientY, primary.position[1]);
      if (!start) return;
      const startPositions: Record<string, [number, number, number]> = {};
      for (const id of movableIds) {
        const it = items[id];
        if (it) startPositions[id] = [...it.position];
      }
      dragRef.current = {
        pointerId: e.pointerId,
        ids: movableIds,
        primaryId,
        grabOffset: new THREE.Vector3(primary.position[0] - start.x, 0, primary.position[2] - start.z),
        baseY: primary.position[1],
        startPositions,
        lastValid: { ...startPositions },
      };
      setOrbitEnabled(false);
      capturePointer(e.pointerId);
      e.preventDefault();
    };

    const beginLift = (pointerId: number, clientY: number, itemId: string) => {
      if (pointersRef.current.size > 1) return;
      const item = useStore.getState().items[itemId];
      if (!item || item.kind === 'hanging') return;
      liftRef.current = {
        pointerId,
        itemId,
        startY: clientY,
        baseElevation: item.position[1],
      };
      onLiftInchesChange?.(Math.round(item.position[1]));
      setOrbitEnabled(false);
      capturePointer(pointerId);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size >= 2) {
        beginCameraGesture();
        return;
      }

      clearPending();

      const selectedItemId = hitSelectedItemId(e.clientX, e.clientY);
      if (selectedItemId) {
        const { selectedIds, items } = useStore.getState();
        const movableIds = selectedIds.filter((id) => {
          const it = items[id];
          return !!it && it.kind !== 'hanging';
        });
        if (!movableIds.includes(selectedItemId)) return;

        const timer = setTimeout(() => {
          const pending = pendingRef.current;
          if (!pending || pending.kind !== 'object' || pending.pointerId !== e.pointerId) return;
          if (pointersRef.current.size > 1) return;
          pendingRef.current = null;
          beginLift(pending.pointerId, pending.startY, pending.primaryId);
        }, LONG_PRESS_MS);

        pendingRef.current = {
          kind: 'object',
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          primaryId: selectedItemId,
          movableIds,
          timer,
        };
        return;
      }

      pendingRef.current = {
        kind: 'tap',
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        itemId: hitAnyItemId(e.clientX, e.clientY),
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // Two-finger pan + pinch zoom
      if (pointersRef.current.size >= 2 && cameraGestureRef.current) {
        const next = pointerMidDist();
        const prev = cameraGestureRef.current;
        if (next && prev) {
          const dx = next.midX - prev.midX;
          const dy = next.midY - prev.midY;
          if (dx !== 0 || dy !== 0) panCamera(dx, dy);
          if (prev.distance > 8 && next.distance > 8) {
            dollyCamera(prev.distance / next.distance);
          }
          cameraGestureRef.current = next;
        }
        e.preventDefault();
        return;
      }

      const lift = liftRef.current;
      if (lift && lift.pointerId === e.pointerId) {
        const item = useStore.getState().items[lift.itemId];
        if (!item) return;
        const dy = lift.startY - e.clientY;
        const nextY = Math.max(0, lift.baseElevation + dy / LIFT_PX_PER_INCH);
        useStore.getState().updatePositions({
          [lift.itemId]: [item.position[0], nextY, item.position[2]],
        });
        onLiftInchesChange?.(Math.round(nextY));
        e.preventDefault();
        return;
      }

      const drag = dragRef.current;
      if (drag && drag.pointerId === e.pointerId) {
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
        const desiredDx = pcx - primaryStart[0];
        const desiredDz = pcz - primaryStart[2];
        const fromDx = primary.position[0] - primaryStart[0];
        const fromDz = primary.position[2] - primaryStart[2];

        const moving = new Set(drag.ids);
        const others = Object.values(state.items).filter((it) => !moving.has(it.id));
        const movers: DragMover[] = [];
        for (const id of drag.ids) {
          const it = state.items[id];
          const start = drag.startPositions[id];
          if (!it || !start) return;
          movers.push({ item: it, start });
        }

        const { dx, dz, desiredOk } = resolveGroupDragDelta(
          movers,
          others,
          desiredDx,
          desiredDz,
          fromDx,
          fromDz,
        );

        const proposed: Record<string, [number, number, number]> = {};
        let appliedOk = true;
        for (const { item, start } of movers) {
          const [cx, cz] = clampToRoom(item, start[0] + dx, start[2] + dz);
          const pos: [number, number, number] = [cx, start[1], cz];
          if (!validatePlacement({ ...item, position: pos }, others).ok) appliedOk = false;
          proposed[item.id] = pos;
        }

        useStore.getState().updatePositions(proposed);
        useStore.getState().setInvalid(!desiredOk);
        if (appliedOk) drag.lastValid = proposed;
        e.preventDefault();
        return;
      }

      const pending = pendingRef.current;
      if (pending?.kind === 'tap' && pending.pointerId === e.pointerId) {
        if (pointersRef.current.size > 1) {
          clearPending();
          return;
        }
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        if (!isTapMovement(dx, dy)) clearPending();
        return;
      }

      if (!pending || pending.kind !== 'object' || pending.pointerId !== e.pointerId) return;
      if (pointersRef.current.size > 1) {
        clearPending();
        return;
      }
      const dx = e.clientX - pending.startX;
      const dy = e.clientY - pending.startY;
      if (dx * dx + dy * dy < MOVE_START_PX * MOVE_START_PX) return;
      clearPending();
      beginDrag(e, pending.primaryId, pending.movableIds);
    };

    const commitTapSelection = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || pending.kind !== 'tap' || pending.pointerId !== e.pointerId) return;
      const dx = e.clientX - pending.startX;
      const dy = e.clientY - pending.startY;
      clearPending();
      if (!isTapMovement(dx, dy)) return;
      if (pending.itemId) {
        useStore.getState().select(pending.itemId);
      } else {
        useStore.getState().select(null);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId);

      commitTapSelection(e);

      if (pendingRef.current?.kind === 'object' && pendingRef.current.pointerId === e.pointerId) {
        clearPending();
      }

      if (liftRef.current?.pointerId === e.pointerId) {
        endLift();
      } else if (dragRef.current?.pointerId === e.pointerId) {
        endDrag(true);
      }

      if (pointersRef.current.size < 2) {
        endCameraGesture();
      } else if (pointersRef.current.size >= 2) {
        cameraGestureRef.current = pointerMidDist();
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      if (
        (pendingRef.current?.kind === 'object' && pendingRef.current.pointerId === e.pointerId) ||
        (pendingRef.current?.kind === 'tap' && pendingRef.current.pointerId === e.pointerId) ||
        dragRef.current?.pointerId === e.pointerId ||
        liftRef.current?.pointerId === e.pointerId
      ) {
        abortObjectGesture();
      }
      if (pointersRef.current.size < 2) endCameraGesture();
    };

    const onLostCapture = (e: Event) => {
      const pe = e as PointerEvent;
      if (!ourCaptureIds.current.has(pe.pointerId)) return;
      ourCaptureIds.current.delete(pe.pointerId);
      if (
        dragRef.current?.pointerId === pe.pointerId ||
        liftRef.current?.pointerId === pe.pointerId
      ) {
        abortObjectGesture();
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('lostpointercapture', onLostCapture);

    return () => {
      clearPending();
      endDrag(false);
      endLift();
      endCameraGesture();
      setOrbitEnabled(true);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('lostpointercapture', onLostCapture);
    };
  }, [
    camera,
    gl,
    scene,
    controls,
    selectedId,
    captureMode,
    designerTool,
    onLiftInchesChange,
  ]);

  return null;
}
