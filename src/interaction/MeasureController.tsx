import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { pickMeasureSurface } from '../lib/measurePick';
import {
  MEASURE_SNAP_PX_DESKTOP,
  MEASURE_SNAP_PX_TOUCH,
  applyMeasureSnap,
} from '../lib/measureSnap';
import { useStore } from '../store';

const CLICK_MAX_PX = 5;
const CLICK_MAX_PX_TOUCH = 10;

/**
 * Click-to-place tape measure: hover reticle on real surfaces, click A then B.
 * Orbit stays enabled — only a short click (not a drag) places a point.
 */
export function MeasureController() {
  const { camera, gl, scene } = useThree();
  const active = useStore((s) => s.designerTool === 'measure');

  const pointerDownRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    isTouch: boolean;
  } | null>(null);

  useEffect(() => {
    if (!active) {
      useStore.getState().setMeasureHover(null);
      return;
    }

    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const setNdc = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
    };

    const resolveHit = (clientX: number, clientY: number, snapEnabled: boolean) => {
      setNdc(clientX, clientY);
      const raw = pickMeasureSurface(raycaster, scene);
      if (!raw) return null;
      if (!snapEnabled) return { ...raw, snapKind: null };

      const state = useStore.getState();
      const rect = canvas.getBoundingClientRect();
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      return applyMeasureSnap(
        raw,
        state.roomGeometry,
        state.items,
        camera,
        rect,
        isTouch ? MEASURE_SNAP_PX_TOUCH : MEASURE_SNAP_PX_DESKTOP,
      );
    };

    const updateHover = (clientX: number, clientY: number, altKey: boolean) => {
      const state = useStore.getState();
      const snapOn = state.measureSnap && !altKey;
      const hit = resolveHit(clientX, clientY, snapOn);
      useStore.getState().setMeasureHover(hit);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointerDownRef.current && pointerDownRef.current.pointerId === e.pointerId) {
        // Still tracking a potential click — keep updating hover for rubber band.
        updateHover(e.clientX, e.clientY, e.altKey);
        return;
      }
      updateHover(e.clientX, e.clientY, e.altKey);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointerDownRef.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        isTouch: e.pointerType === 'touch',
      };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!down || down.pointerId !== e.pointerId) return;

      const threshold = down.isTouch ? CLICK_MAX_PX_TOUCH : CLICK_MAX_PX;
      const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (dist > threshold) return;

      const state = useStore.getState();
      const snapOn = state.measureSnap && !e.altKey;
      const hit = resolveHit(e.clientX, e.clientY, snapOn);
      if (!hit) return;

      useStore.getState().placeMeasurePoint(hit.point);
      // Keep reticle for next point.
      useStore.getState().setMeasureHover(hit);
    };

    const onPointerLeave = () => {
      if (!pointerDownRef.current) {
        useStore.getState().setMeasureHover(null);
      }
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
      const state = useStore.getState();
      if (state.measureImportAccept) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (state.measurePending) {
          useStore.getState().cancelMeasurePending();
        } else {
          useStore.getState().cancelMeasure();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        useStore.getState().finishMeasure();
      }
    };

    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKeyDown, true);
      canvas.style.cursor = '';
      pointerDownRef.current = null;
      useStore.getState().setMeasureHover(null);
    };
  }, [active, camera, gl, scene]);

  return null;
}
