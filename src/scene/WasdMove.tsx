import { useEffect, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import * as THREE from 'three';
import { pointInPolygon, type FloorPlan, type FloorPlanBounds } from '../lib/floorPlanGeometry';
import {
  EYE_LEVEL_MAX,
  clampTargetXZ,
  emptyWasdKeys,
  slideKeepsFooting,
  wasdKeyFromCode,
  wasdTranslation,
} from './wasdPan';

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Slides the orbit camera across the floor with WASD.
 * Drag still orbits; the look angle stays put while you move.
 */
export function WasdMove({
  controlsRef,
  animRequestRef,
  orbitTarget,
  bounds,
  plan,
}: {
  controlsRef: RefObject<OrbitControlsType | null>;
  animRequestRef: { current: { framing: unknown | null } };
  orbitTarget: THREE.Vector3;
  bounds: FloorPlanBounds;
  plan: FloorPlan;
}) {
  const keys = useRef(emptyWasdKeys());
  const look = useRef(new THREE.Vector3());
  const screenUp = useRef(new THREE.Vector3());
  const boundsRef = useRef(bounds);
  const planRef = useRef(plan);
  boundsRef.current = bounds;
  planRef.current = plan;

  useEffect(() => {
    const clear = () => {
      keys.current = emptyWasdKeys();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        clear();
        return;
      }
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      const key = wasdKeyFromCode(e.code);
      if (!key) return;
      keys.current[key] = true;
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = wasdKeyFromCode(e.code);
      if (!key) return;
      keys.current[key] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, []);

  useFrame((_, dt) => {
    const held = keys.current;
    if (!held.w && !held.a && !held.s && !held.d) return;
    if (isTypingTarget(document.activeElement)) {
      keys.current = emptyWasdKeys();
      return;
    }
    if (animRequestRef.current.framing) return;
    const ctrl = controlsRef.current;
    if (!ctrl || !ctrl.enabled || ctrl.autoRotate) return;

    const cam = ctrl.object;
    cam.getWorldDirection(look.current);
    screenUp.current.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const move = wasdTranslation(
      look.current,
      screenUp.current,
      held,
      cam.position.distanceTo(ctrl.target),
      dt,
    );
    if (!move) return;

    const plan = planRef.current;
    const onFoot =
      cam.position.y <= EYE_LEVEL_MAX &&
      pointInPolygon(cam.position.x, cam.position.z, plan, 0);
    let dx = move.x;
    let dz = move.z;
    if (onFoot) {
      const slide = slideKeepsFooting(cam.position.x, cam.position.z, dx, dz, plan);
      dx = slide.dx;
      dz = slide.dz;
    } else {
      const next = clampTargetXZ(ctrl.target.x + dx, ctrl.target.z + dz, boundsRef.current);
      dx = next.x - ctrl.target.x;
      dz = next.z - ctrl.target.z;
    }
    if (dx === 0 && dz === 0) return;

    ctrl.target.x += dx;
    ctrl.target.z += dz;
    cam.position.x += dx;
    cam.position.z += dz;
    orbitTarget.copy(ctrl.target);
    ctrl.update();
  });

  return null;
}
