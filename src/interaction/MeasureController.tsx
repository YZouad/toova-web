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
  const { camera, gl } = useThree();
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

      const endpoint = endpointUnderPointer(e.clientX, e.clientY);
      if (!endpoint) return;

      e.stopPropagation();
      const world = endpoint === 'a' ? draft.a : draft.b;
      const planeHit = screenToPlane(e.clientX, e.clientY, world[1]);
      if (!planeHit) return;

      useStore.getState().setMeasureActiveEndpoint(endpoint);
      orbitWasEnabledRef.current = controls?.enabled !== false;
      setOrbitEnabled(false);

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

      const pending = pendingRef.current;
      if (pending?.pointerId === e.pointerId) {
        pendingRef.current = null;
        useStore.getState().setMeasureActiveEndpoint(pending.endpoint);
        setOrbitEnabled(orbitWasEnabledRef.current);
        setCursor('grab');
        return;
      }

      const drag = draggingRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;

      draggingRef.current = null;
      useStore.getState().endMeasureEndpointDrag();
      setOrbitEnabled(orbitWasEnabledRef.current);
      setCursor(endpointUnderPointer(e.clientX, e.clientY) ? 'grab' : 'crosshair');
    };

    const onPointerCancel = () => {
      pendingRef.current = null;
      if (draggingRef.current) {
        draggingRef.current = null;
        useStore.getState().endMeasureEndpointDrag();
      }
      setOrbitEnabled(orbitWasEnabledRef.current);
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
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
      canvas.style.cursor = '';
      pendingRef.current = null;
      draggingRef.current = null;
      setOrbitEnabled(true);
    };
  }, [active, camera, controls, gl]);

  return null;
}
