import { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';
import { GIZMO_BLUE, GIZMO_BLUE_HOT, HeightArrow } from './HeightArrow';

const _hit = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

const GIZMO_BLUE_TICK = '#4a5a6c';

function yawFromPoint(origin: THREE.Vector3, point: THREE.Vector3): number {
  return Math.atan2(point.x - origin.x, point.z - origin.z);
}

function useOrbitControls() {
  return useThree((s) => s.controls) as { enabled?: boolean } | null;
}

function setOrbitEnabled(controls: { enabled?: boolean } | null, enabled: boolean) {
  if (controls) controls.enabled = enabled;
}

function clientToRay(camera: THREE.Camera, gl: THREE.WebGLRenderer, clientX: number, clientY: number) {
  const rect = gl.domElement.getBoundingClientRect();
  _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_ndc, camera);
  return _raycaster.ray;
}

/**
 * Advanced controls: green up/down arrow for height + base yaw ring.
 * Floor XZ move stays on the normal drag interaction.
 */
export function ObjectGizmo() {
  const advanced = useStore((s) => s.visual.advancedControls);
  const selectedId = useStore((s) => s.selectedId);
  const item = useStore((s) => (selectedId ? s.items[selectedId] : null));
  const updateRotation = useStore((s) => s.updateRotation);
  const setItemElevation = useStore((s) => s.setItemElevation);
  const setInvalid = useStore((s) => s.setInvalid);
  const controls = useOrbitControls();

  useEffect(() => {
    if (!advanced) {
      setOrbitEnabled(controls, true);
      return;
    }
    const onUp = () => setOrbitEnabled(controls, true);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setOrbitEnabled(controls, true);
    };
  }, [advanced, controls, selectedId]);

  if (!advanced || !item || item.kind === 'hanging') return null;

  const footprint = Math.max(item.size[0], item.size[2], 8);
  const yawRadius = Math.min(28, Math.max(6, footprint * 0.55));
  const arrowLen = Math.min(36, Math.max(14, item.size[1] * 0.55 + 10));

  return (
    <group>
      <HeightArrow
        position={[
          item.position[0],
          item.position[1] + item.size[1],
          item.position[2],
        ]}
        baseY={item.position[1]}
        length={arrowLen}
        onLift={(y) => setItemElevation(item.id, y)}
        onDragStart={() => setOrbitEnabled(controls, false)}
        onDragEnd={() => {
          setInvalid(false);
          setOrbitEnabled(controls, true);
        }}
      />
      <YawRing
        position={[item.position[0], item.position[1] + 0.4, item.position[2]]}
        radius={yawRadius}
        rotationY={item.rotationY}
        onRotate={(rotationY) => {
          updateRotation(item.id, rotationY);
        }}
        onDragStart={() => setOrbitEnabled(controls, false)}
        onDragEnd={() => {
          setOrbitEnabled(controls, true);
        }}
      />
    </group>
  );
}

/** Horizontal ring at the object base for yaw-only rotation. */
function YawRing({
  position,
  radius,
  rotationY,
  onRotate,
  onDragStart,
  onDragEnd,
}: {
  position: [number, number, number];
  radius: number;
  rotationY: number;
  onRotate: (rotationY: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { camera, gl } = useThree();
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  const dragging = useRef<{
    originYaw: number;
    pointerYaw0: number;
    origin: THREE.Vector3;
    plane: THREE.Plane;
  } | null>(null);
  const onDragEndRef = useRef(onDragEnd);
  const onRotateRef = useRef(onRotate);
  onDragEndRef.current = onDragEnd;
  onRotateRef.current = onRotate;

  const tube = Math.max(0.22, radius * 0.028);
  const hitInner = Math.max(0, radius - Math.max(2.2, radius * 0.18));
  const hitOuter = radius + Math.max(2.2, radius * 0.18);
  const color = hovered || active ? GIZMO_BLUE_HOT : GIZMO_BLUE;

  useEffect(() => {
    if (!active) return;

    const onMove = (e: PointerEvent) => {
      const drag = dragging.current;
      if (!drag) return;
      const ray = clientToRay(camera, gl, e.clientX, e.clientY);
      if (!ray.intersectPlane(drag.plane, _hit)) return;
      const pointerYaw = yawFromPoint(drag.origin, _hit);
      onRotateRef.current(drag.originYaw + (pointerYaw - drag.pointerYaw0));
    };

    const end = () => {
      if (!dragging.current) return;
      dragging.current = null;
      setActive(false);
      onDragEndRef.current();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [active, camera, gl]);

  const beginDrag = (clientX: number, clientY: number) => {
    const origin = new THREE.Vector3(position[0], position[1], position[2]);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -position[1]);
    const ray = clientToRay(camera, gl, clientX, clientY);
    if (!ray.intersectPlane(plane, _hit)) return false;
    // Accept the click anywhere around the ring radius (not only the thin tube).
    const dist = Math.hypot(_hit.x - origin.x, _hit.z - origin.z);
    if (dist < hitInner || dist > hitOuter) return false;
    dragging.current = {
      originYaw: rotationY,
      pointerYaw0: yawFromPoint(origin, _hit),
      origin,
      plane,
    };
    setActive(true);
    onDragStart();
    return true;
  };

  return (
    <group position={position}>
      {/* Wide invisible annulus so any point near the ring starts a rotate drag */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          if (!dragging.current) setHovered(false);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          beginDrag(e.clientX, e.clientY);
        }}
      >
        <ringGeometry args={[hitInner, hitOuter, 64]} />
        <meshBasicMaterial transparent opacity={0} depthTest={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Thin dark-blue visual ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[radius, tube, 10, 72]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.92} />
      </mesh>

      <group rotation={[0, rotationY, 0]}>
        <mesh position={[0, 0.04, radius]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <circleGeometry args={[Math.max(0.55, tube * 1.6), 12]} />
          <meshBasicMaterial color={hovered || active ? GIZMO_BLUE_HOT : GIZMO_BLUE_TICK} depthTest={false} />
        </mesh>
      </group>
    </group>
  );
}

