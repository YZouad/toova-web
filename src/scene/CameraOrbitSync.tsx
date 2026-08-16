import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import {
  applySidebarTiltToElement,
  clearSidebarTiltOnElement,
  type OrbitBaseline,
} from '../lib/bedding/sidebarTilt';

const SYNC_INTERVAL_MS = 1000 / 30;

interface Props {
  controlsRef: RefObject<OrbitControlsType | null>;
  targetRef?: RefObject<HTMLElement | null>;
}

/** Writes orbit angles to CSS vars on the canvas wrap for bedding sidebar 3D tilt. */
export function CameraOrbitSync({ controlsRef, targetRef }: Props) {
  const baselineRef = useRef<OrbitBaseline | null>(null);
  const lastSyncRef = useRef(0);

  useFrame(({ clock }) => {
    const target = targetRef?.current;
    const ctrl = controlsRef.current;
    if (!target || !ctrl) return;

    const now = clock.elapsedTime * 1000;
    if (now - lastSyncRef.current < SYNC_INTERVAL_MS) return;
    lastSyncRef.current = now;

    const azimuth = ctrl.getAzimuthalAngle();
    const polar = ctrl.getPolarAngle();

    if (!baselineRef.current) {
      baselineRef.current = { azimuth, polar };
    }

    applySidebarTiltToElement(target, azimuth, polar, baselineRef.current);
  });

  return null;
}

export function resetOrbitBaseline(
  controlsRef: RefObject<OrbitControlsType | null>,
  baselineRef: { current: OrbitBaseline | null },
): void {
  const ctrl = controlsRef.current;
  if (!ctrl) {
    baselineRef.current = null;
    return;
  }
  baselineRef.current = {
    azimuth: ctrl.getAzimuthalAngle(),
    polar: ctrl.getPolarAngle(),
  };
}

export { clearSidebarTiltOnElement };
