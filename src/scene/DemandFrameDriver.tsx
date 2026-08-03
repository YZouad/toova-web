import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../store';

/**
 * Keep the Canvas on frameloop="demand" but wake frames while the user orbits
 * (pointer drag + damping) or when the store changes.
 */
export function DemandFrameDriver() {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls);
  const dragging = useRef(false);
  const dampingFrames = useRef(0);

  useEffect(() => {
    invalidate();
    return useStore.subscribe(() => {
      invalidate();
    });
  }, [invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    const onDown = () => {
      dragging.current = true;
      dampingFrames.current = 0;
      invalidate();
    };
    const onUp = () => {
      dragging.current = false;
      // Keep a few frames so orbit damping can settle under demand mode.
      dampingFrames.current = 45;
      invalidate();
    };
    const onMove = () => {
      if (dragging.current) invalidate();
    };
    const onWheel = () => {
      dampingFrames.current = 30;
      invalidate();
    };
    const onResize = () => invalidate();
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('pointermove', onMove);
    el.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('resize', onResize);
    const onVis = () => {
      if (document.visibilityState === 'visible') invalidate();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('pointermove', onMove);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [gl, invalidate]);

  useEffect(() => {
    if (!controls || typeof (controls as { addEventListener?: unknown }).addEventListener !== 'function') {
      return;
    }
    const c = controls as unknown as {
      addEventListener: (type: string, fn: () => void) => void;
      removeEventListener: (type: string, fn: () => void) => void;
    };
    const kick = () => {
      dampingFrames.current = Math.max(dampingFrames.current, 20);
      invalidate();
    };
    c.addEventListener('change', kick);
    c.addEventListener('start', kick);
    c.addEventListener('end', () => {
      dampingFrames.current = 45;
      invalidate();
    });
    return () => {
      c.removeEventListener('change', kick);
      c.removeEventListener('start', kick);
      c.removeEventListener('end', kick);
    };
  }, [controls, invalidate]);

  useFrame(() => {
    if (dragging.current) {
      invalidate();
      return;
    }
    if (dampingFrames.current > 0) {
      dampingFrames.current -= 1;
      invalidate();
    }
  });

  return null;
}
