import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { apartmentModeFor } from '../lib/apartmentRooms';
import { useStore } from '../store';
import { DOLLHOUSE_CUT_HEIGHT, setDollhouseCutHeight } from './dollhouseClip';

/** How far the rest of the apartment drops (inches) when a room is focused. */
export const APARTMENT_DROP_DISTANCE = 220;

/** Shared progress (0 overview → 1 focused) for interaction locks. */
let transitionProgress = 0;

export function getApartmentTransitionProgress(): number {
  return transitionProgress;
}

export function isApartmentInteractionLocked(): boolean {
  return transitionProgress > 0.02 && transitionProgress < 0.98;
}

/**
 * Progress driver for overview ↔ focused.
 * Writes `restGroup.position.y` and the dollhouse clip height.
 * Interruptible: chases target 0 (overview) or 1 (focused).
 */
export function ApartmentTransition({
  restGroupRef,
  focusGroupRef,
  onProgress,
}: {
  restGroupRef: React.RefObject<THREE.Group | null>;
  focusGroupRef: React.RefObject<THREE.Group | null>;
  onProgress?: (p: number) => void;
}) {
  const roomGeometry = useStore((s) => s.roomGeometry);
  const focusedRoomId = useStore((s) => s.focusedRoomId);
  const mode = apartmentModeFor(roomGeometry, focusedRoomId);
  const reduced = usePrefersReducedMotion();
  const progress = useRef(mode === 'focused' ? 1 : 0);
  const target = useRef(mode === 'focused' ? 1 : 0);

  useEffect(() => {
    target.current = mode === 'focused' ? 1 : mode === 'overview' ? 0 : 1;
    if (reduced) {
      progress.current = target.current;
      apply(progress.current);
    }
  }, [mode, reduced]);

  const apply = (p: number) => {
    const rest = restGroupRef.current;
    if (rest) {
      rest.position.y = -APARTMENT_DROP_DISTANCE * p;
      rest.visible = p < 0.999;
    }
    const focus = focusGroupRef.current;
    if (focus) {
      focus.position.y = 0;
    }
    // Blend clip height: cut in overview, full walls when focused.
    const fullH = roomGeometry.height;
    setDollhouseCutHeight(THREE.MathUtils.lerp(DOLLHOUSE_CUT_HEIGHT, fullH + 10, p));
    transitionProgress = p;
    onProgress?.(p);
  };

  useFrame((_, dt) => {
    if (mode === 'single') {
      progress.current = 1;
      apply(1);
      return;
    }
    const speed = reduced ? 100 : 2.4;
    const t = target.current;
    const p = progress.current;
    if (Math.abs(p - t) < 0.001) {
      if (p !== t) {
        progress.current = t;
        apply(t);
      }
      return;
    }
    const next = THREE.MathUtils.damp(p, t, speed, dt);
    progress.current = next;
    apply(next);
  });

  return null;
}

/** True while a transition is mid-flight (for locking drag / tools). */
export function isApartmentTransitioning(
  progress: number,
  mode: 'single' | 'overview' | 'focused',
): boolean {
  if (mode === 'single') return false;
  const target = mode === 'focused' ? 1 : 0;
  return Math.abs(progress - target) > 0.02;
}
