import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { apartmentModeFor } from '../lib/apartmentRooms';
import { useStore } from '../store';
import {
  DOLLHOUSE_CUT_HEIGHT,
  dollhouseCutHeightFor,
  setDollhouseCutHeight,
} from './dollhouseClip';

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

export type ApartmentTransitionPhase = 'overview' | 'moving' | 'focused';

let phase: ApartmentTransitionPhase = 'overview';
const phaseListeners = new Set<() => void>();

function setPhase(next: ApartmentTransitionPhase) {
  if (phase === next) return;
  phase = next;
  for (const listener of phaseListeners) listener();
}

function subscribePhase(listener: () => void) {
  phaseListeners.add(listener);
  return () => phaseListeners.delete(listener);
}

/** Settled/moving state; only changes at transition start and end (cheap to subscribe). */
export function useApartmentTransitionPhase(): ApartmentTransitionPhase {
  return useSyncExternalStore(subscribePhase, () => phase, () => phase);
}

/**
 * Progress driver for overview ↔ focused. Stays mounted across both modes so
 * the drop animates instead of jumping to its end state.
 * Writes `restGroup.position.y` and the dollhouse clip height (focused walls
 * grow from the cut height to full height while the rest drops away).
 *
 * Architectural materials already carry the clip plane (see dollhouseClip), so
 * this never walks the scene graph or triggers shader recompiles.
 */
export function ApartmentTransition({
  restGroupRef,
}: {
  restGroupRef: React.RefObject<THREE.Group | null>;
  /** Kept for call-site compatibility; clip is material-owned now. */
  focusGroupRef?: React.RefObject<THREE.Group | null>;
}) {
  const roomGeometry = useStore((s) => s.roomGeometry);
  const focusedRoomId = useStore((s) => s.focusedRoomId);
  const mode = apartmentModeFor(roomGeometry, focusedRoomId);
  const reduced = usePrefersReducedMotion();
  const gl = useThree((s) => s.gl);
  const progress = useRef(mode === 'focused' ? 1 : 0);
  const target = useRef(mode === 'focused' ? 1 : 0);
  const needsApply = useRef(true);

  useEffect(() => {
    gl.localClippingEnabled = true;
    return () => {
      gl.localClippingEnabled = false;
      setDollhouseCutHeight(DOLLHOUSE_CUT_HEIGHT);
      transitionProgress = 0;
      setPhase('overview');
    };
  }, [gl]);

  useEffect(() => {
    target.current = mode === 'focused' ? 1 : 0;
    if (reduced) progress.current = target.current;
    needsApply.current = true;
  }, [mode, reduced]);

  useEffect(() => {
    needsApply.current = true;
  }, [roomGeometry.height, roomGeometry.openings]);

  /**
   * Clip height vs rest drop.
   * Enter (0→1): walls grow with progress (dollhouse → full).
   * Exit (1→0): keep full height until the rest is mostly risen, then cut —
   * otherwise truncated walls sliding up look like a flat slab, not a rise.
   */
  const clipAmount = (p: number, t: number) => {
    const exiting = t < p - 0.001;
    if (!exiting) return p;
    if (p > 0.4) return 1;
    return p / 0.4;
  };

  const apply = (p: number, t: number) => {
    const rest = restGroupRef.current;
    if (rest) {
      rest.position.y = -APARTMENT_DROP_DISTANCE * p;
      rest.visible = p < 0.999;
    }
    const cutY = dollhouseCutHeightFor(roomGeometry);
    const clipP = clipAmount(p, t);
    setDollhouseCutHeight(THREE.MathUtils.lerp(cutY, roomGeometry.height + 10, clipP));
    transitionProgress = p;
    setPhase(p >= 0.999 ? 'focused' : p <= 0.001 ? 'overview' : 'moving');
  };

  useFrame((_, dt) => {
    const t = target.current;
    const p = progress.current;
    if (Math.abs(p - t) < 0.001) {
      if (p !== t || needsApply.current) {
        progress.current = t;
        needsApply.current = false;
        apply(t, t);
      }
      return;
    }
    const next = THREE.MathUtils.damp(p, t, 4.5, Math.min(dt, 1 / 30));
    progress.current = Math.abs(next - t) < 0.001 ? t : next;
    needsApply.current = false;
    apply(progress.current, t);
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
