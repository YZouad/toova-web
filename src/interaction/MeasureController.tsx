import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MeasureVec3 } from '../lib/measureDistance';
import { worldToScreen } from '../lib/measureScreen';
import { useStore } from '../store';

const DRAG_START_PX = 5;
const ENDPOINT_HIT_PX = 18;

/**
 * Free-floating measure endpoints — XZ drag on a horizontal plane (like free lights).
 * Orbit stays enabled except while dragging a point.
 */
export function MeasureController() {
  const { camera, gl, scene } = useThree();
  const controls = useThree((s) => s.controls) as { enabled?: boolean } | null;
  const active = useStore((s) => s.designerTool === 'measure');

  const pendingRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    endpoint: 'a' | 'b';
    grabOffset: THREE.Vector3;
    planeY: number;
  } | null>(null);

  const draggingRef = useRef<{
    pointerId: number;
    endpoint: 'a' | 'b';
    grabOffset: THREE.Vector3;
    planeY: number;
  } | null>(null);

  const orbitWasEnabledRef = useRef(true);
  /** Height-arrow press: orbit is locked, but the arrow mesh owns the gesture. */
  const arrowPressRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;

    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();

    const setOrbitEnabled = (on: boolean) => {
      if (!controls || typeof controls.enabled !== 'boolean') return;
      controls.enabled = on;
    };

    const screenToPlane = (clientX: number, clientY: number, planeY: number): MeasureVec3 | null => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      plane.constant = -planeY;
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return [hit.x, planeY, hit.z];
    };

    const hitsHeightArrow = (clientX: number, clientY: number): boolean => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      const closest = hits[0];
      if (!closest) return false;
      let obj: THREE.Object3D | null = closest.object;
      while (obj) {
        if (obj.userData?.heightArrow) return true;
        obj = obj.parent;
      }
      return false;
    };

    const lockOrbit = () => {
      orbitWasEnabledRef.current = controls?.enabled !== false;
      setOrbitEnabled(false);
    };

    const unlockOrbit = () => {
      setOrbitEnabled(orbitWasEnabledRef.current);
    };

    const endpointUnderPointer = (clientX: number, clientY: number): 'a' | 'b' | null => {
      const draft = useStore.getState().measureDraft;
      if (!draft) return null;
      const rect = canvas.getBoundingClientRect();
      let best: 'a' | 'b' | null = null;
      let bestDist = ENDPOINT_HIT_PX + 1;
      const consider = (id: 'a' | 'b', world: MeasureVec3) => {
        const screen = worldToScreen(world, camera, rect);
        const dist = Math.hypot(screen[0] - clientX, screen[1] - clientY);
        if (dist < bestDist) {
          best = id;
          bestDist = dist;
        }
      };
      consider('a', draft.a);
      consider('b', draft.b);
      return best;
    };

    const setCursor = (kind: 'crosshair' | 'grab' | 'grabbing') => {
      canvas.style.cursor = kind;
    };

    const onPointerMove = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (pending && pending.pointerId === e.pointerId && !draggingRef.current) {
        const dist = Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY);
        if (dist > DRAG_START_PX) {
          draggingRef.current = {
            pointerId: e.pointerId,
            endpoint: pending.endpoint,
            grabOffset: pending.grabOffset,
            planeY: pending.planeY,
          };
          pendingRef.current = null;
          useStore.getState().beginMeasureEndpointDrag(pending.endpoint);
          setCursor('grabbing');
        }
      }

      const drag = draggingRef.current;
      if (!drag || drag.pointerId !== e.pointerId) {
        const handle = endpointUnderPointer(e.clientX, e.clientY);
        setCursor(handle ? 'grab' : 'crosshair');
        return;
      }

      const planeHit = screenToPlane(e.clientX, e.clientY, drag.planeY);
      if (!planeHit) return;
      useStore.getState().setMeasureEndpoint(drag.endpoint, [
        planeHit[0] + drag.grabOffset.x,
        drag.planeY,
        planeHit[2] + drag.grabOffset.z,
      ]);
      setCursor('grabbing');
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const draft = useStore.getState().measureDraft;
      if (!draft) return;

      // Capture phase, before OrbitControls. A height-arrow press keeps the
      // event so the arrow can drag; an endpoint press consumes it.
      if (hitsHeightArrow(e.clientX, e.clientY)) {
        lockOrbit();
        arrowPressRef.current = e.pointerId;
        return;
      }

      const endpoint = endpointUnderPointer(e.clientX, e.clientY);
      if (!endpoint) return;

      e.stopPropagation();
      const world = endpoint === 'a' ? draft.a : draft.b;
      const planeHit = screenToPlane(e.clientX, e.clientY, world[1]);
      if (!planeHit) return;

      useStore.getState().setMeasureActiveEndpoint(endpoint);
      lockOrbit();

      pendingRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        endpoint,
        grabOffset: new THREE.Vector3(world[0] - planeHit[0], 0, world[2] - planeHit[2]),
        planeY: world[1],
      };
      setCursor('grabbing');
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;

      if (arrowPressRef.current === e.pointerId) {
        arrowPressRef.current = null;
        unlockOrbit();
        return;
      }

      const pending = pendingRef.current;
      if (pending?.pointerId === e.pointerId) {
        pendingRef.current = null;
        useStore.getState().setMeasureActiveEndpoint(pending.endpoint);
        unlockOrbit();
        setCursor('grab');
        return;
      }

      const drag = draggingRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;

      draggingRef.current = null;
      useStore.getState().endMeasureEndpointDrag();
      unlockOrbit();
      setCursor(endpointUnderPointer(e.clientX, e.clientY) ? 'grab' : 'crosshair');
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (arrowPressRef.current != null && arrowPressRef.current !== e.pointerId) return;
      if (
        arrowPressRef.current == null &&
        pendingRef.current?.pointerId !== e.pointerId &&
        draggingRef.current?.pointerId !== e.pointerId
      ) {
        return;
      }
      arrowPressRef.current = null;
      pendingRef.current = null;
      if (draggingRef.current) {
        draggingRef.current = null;
        useStore.getState().endMeasureEndpointDrag();
      }
      unlockOrbit();
      setCursor('crosshair');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const draft = useStore.getState().measureDraft;
      if (!draft) return;
      if (draft.importAccept) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        useStore.getState().cancelMeasure();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!draft.draggingEndpoint) useStore.getState().finishMeasure();
      }
    };

    setCursor('crosshair');
    canvas.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
      canvas.style.cursor = '';
      pendingRef.current = null;
      draggingRef.current = null;
      arrowPressRef.current = null;
      setOrbitEnabled(true);
    };
  }, [active, camera, controls, gl, scene]);

  return null;
}
