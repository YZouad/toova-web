import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';
import {
  furnitureLocalFromWorld,
  wallAnchorFromWorldHit,
  type HangingAnchor,
  type Vec3,
} from '../lib/hangingDecorGeometry';
import { allWallSegments, getWallSegment, wallById } from '../lib/floorPlanGeometry';

/**
 * Multi-anchor hanging placement:
 * click walls/furniture to place anchors, live cursor preview, Enter/dblclick finish,
 * Backspace pop, Escape cancel. Orbit stays enabled — drag to look around, click to place.
 */
export function HangingPlacementController() {
  const { camera, gl, scene } = useThree();
  const tool = useStore((s) => s.designerTool);
  const active = tool === 'hanging-leaves' || tool === 'hanging-lights';
  const lastClickRef = useRef(0);
  const pointerDownRef = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    if (!active) return;

    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const setNdc = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
    };

    const pickAnchor = (clientX: number, clientY: number): { anchor: HangingAnchor; world: Vec3 } | null => {
      setNdc(clientX, clientY);
      const hits = raycaster.intersectObjects(scene.children, true);
      const state = useStore.getState();
      const geom = state.roomGeometry;

      for (const hit of hits) {
        const objHit = hit.object;
        // Shadow proxies / helpers must not steal picks.
        if (objHit.userData?.hangingPick === false) continue;
        if (!objHit.visible) continue;

        // Orbit cutaway fades walls via material.opacity — ignore see-through surfaces
        // so anchors land on the wall/furniture you're actually looking at.
        const mesh = objHit as THREE.Mesh;
        const rawMat = mesh.material;
        const mats: THREE.Material[] = Array.isArray(rawMat)
          ? rawMat
          : rawMat
            ? [rawMat]
            : [];
        const opacity = mats.reduce((min: number, m: THREE.Material) => {
          const o = (m as THREE.Material & { opacity?: number }).opacity;
          return Math.min(min, o ?? 1);
        }, 1);
        if (opacity < 0.4) continue;

        let obj: THREE.Object3D | null = objHit;
        let wallId: string | null = null;
        let itemId: string | null = null;
        while (obj) {
          if (!obj.visible) {
            wallId = null;
            itemId = null;
            break;
          }
          if (obj.userData?.wallId) wallId = obj.userData.wallId as string;
          if (obj.userData?.itemId && !obj.userData?.hanging) {
            itemId = obj.userData.itemId as string;
          }
          obj = obj.parent;
        }
        if (!wallId && !itemId) continue;

        const world: Vec3 = [hit.point.x, hit.point.y, hit.point.z];

        if (wallId) {
          const wall = wallById(geom, wallId);
          if (!wall) continue;
          const seg = getWallSegment(geom, wall);
          if (!seg) continue;
          const anchor = wallAnchorFromWorldHit(seg, world);
          const resolved = allWallSegments(geom).find((s) => s.wall.id === wallId);
          if (resolved) {
            const [ox, oz] = resolved.outward;
            world[0] -= ox * 0.4;
            world[2] -= oz * 0.4;
          }
          return { anchor, world };
        }

        if (itemId) {
          const item = state.items[itemId];
          if (!item || item.kind === 'hanging' || item.kind === 'light') continue;
          const local = furnitureLocalFromWorld(
            {
              attachmentKey: item.attachmentKey,
              position: item.position,
              rotationY: item.rotationY,
              size: item.size,
            },
            world,
          );
          const n = hit.face
            ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
            : new THREE.Vector3(0, 1, 0);
          world[0] += n.x * 0.35;
          world[1] += n.y * 0.35;
          world[2] += n.z * 0.35;
          return {
            anchor: {
              surface: 'furniture',
              attachmentKey: item.attachmentKey,
              local,
            },
            world,
          };
        }
      }
      return null;
    };

    const placeAt = (clientX: number, clientY: number, isDouble: boolean) => {
      const picked = pickAnchor(clientX, clientY);
      if (!picked) return;
      useStore.getState().appendHangingAnchor(picked.anchor);
      useStore.getState().setHangingCursor(picked.world);
      if (isDouble) {
        const draft = useStore.getState().hangingDraft;
        if (draft && draft.anchors.length >= 2) {
          useStore.getState().finishHangingDraft();
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!useStore.getState().hangingDraft) return;
      const picked = pickAnchor(e.clientX, e.clientY);
      useStore.getState().setHangingCursor(picked ? picked.world : null);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (!useStore.getState().hangingDraft) return;
      // Don't disable orbit — record press; place only on a short click (not a drag).
      pointerDownRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (!useStore.getState().hangingDraft) return;
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!down) return;
      const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      // Drag ⇒ orbit; only treat as a place click when barely moved.
      if (dist > 5 || dt > 500) return;

      const now = performance.now();
      const isDouble = now - lastClickRef.current < 320;
      lastClickRef.current = now;
      placeAt(e.clientX, e.clientY, isDouble);
    };

    const onPointerCancel = () => {
      pointerDownRef.current = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const draft = useStore.getState().hangingDraft;
      if (!draft) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        useStore.getState().cancelHangingDraft();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (draft.anchors.length >= 2) useStore.getState().finishHangingDraft();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (draft.anchors.length > 0) useStore.getState().popHangingAnchor();
        else useStore.getState().cancelHangingDraft();
      }
    };

    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
      canvas.style.cursor = '';
      pointerDownRef.current = null;
      useStore.getState().setHangingCursor(null);
    };
  }, [active, camera, gl, scene]);

  return null;
}
