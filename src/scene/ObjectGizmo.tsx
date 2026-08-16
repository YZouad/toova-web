import { useEffect, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clampFullItemPosition, useStore } from '../store';
import { validatePlacement } from '../interaction/collision';

const _hit = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

/** Shared gizmo chrome — desaturated dark blue. */
const GIZMO_BLUE = '#3a4a5c';
const GIZMO_BLUE_HOT = '#536274';
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
  const updatePosition = useStore((s) => s.updatePosition);
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
          const position = clampFullItemPosition(item.position, rotationY, item.size);
          const candidate = { ...item, position, rotationY };
          const others = Object.values(useStore.getState().items).filter((o) => o.id !== item.id);
          if (!validatePlacement(candidate, others).ok) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          updateRotation(item.id, rotationY);
          updatePosition(item.id, position);
        }}
        onDragStart={() => setOrbitEnabled(controls, false)}
        onDragEnd={() => {
          setInvalid(false);
          setOrbitEnabled(controls, true);
        }}
      />
    </group>
  );
}

/** World-space vertical arrow — drag along Y to change height. */
function HeightArrow({
  position,
  baseY,
  length,
  onLift,
  onDragStart,
  onDragEnd,
}: {
  position: [number, number, number];
  baseY: number;
  length: number;
  onLift: (y: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { camera, gl } = useThree();
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  const dragging = useRef<{
    itemY0: number;
    pointerY0: number;
    origin: THREE.Vector3;
    plane: THREE.Plane;
  } | null>(null);
  const onDragEndRef = useRef(onDragEnd);
  const onLiftRef = useRef(onLift);
  onDragEndRef.current = onDragEnd;
  onLiftRef.current = onLift;

  const coneH = Math.max(2.2, length * 0.18);
  const shaftH = Math.max(8, length - coneH);
  const color = hovered || active ? GIZMO_BLUE_HOT : GIZMO_BLUE;

  // Track pointer on window so fast mouse moves don't fall off the mesh and stutter.
  useEffect(() => {
    if (!active) return;

    const onMove = (e: PointerEvent) => {
      const drag = dragging.current;
      if (!drag) return;
      const ray = clientToRay(camera, gl, e.clientX, e.clientY);
      if (!ray.intersectPlane(drag.plane, _hit)) return;
      onLiftRef.current(drag.itemY0 + (_hit.y - drag.pointerY0));
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

  return (
    <group position={position}>
      <mesh
        position={[0, shaftH / 2 + coneH * 0.15, 0]}
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
          const origin = new THREE.Vector3(position[0], position[1], position[2]);
          const toCam = new THREE.Vector3(
            e.camera.position.x - origin.x,
            0,
            e.camera.position.z - origin.z,
          );
          if (toCam.lengthSq() < 1e-6) toCam.set(0, 0, 1);
          toCam.normalize();
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(toCam, origin);
          const ray = clientToRay(camera, gl, e.clientX, e.clientY);
          if (!ray.intersectPlane(plane, _hit)) return;
          dragging.current = {
            itemY0: baseY,
            pointerY0: _hit.y,
            origin,
            plane,
          };
          setActive(true);
          onDragStart();
        }}
      >
        <cylinderGeometry
          args={[Math.max(2.5, length * 0.08), Math.max(2.5, length * 0.08), shaftH + coneH, 8]}
        />
        <meshBasicMaterial transparent opacity={0} depthTest={false} />
      </mesh>

      <Line
        points={[0, 0, 0, 0, shaftH, 0]}
        color={color}
        lineWidth={3}
        transparent
        opacity={0.95}
        depthTest={false}
        raycast={() => null}
      />
      <mesh position={[0, shaftH + coneH / 2, 0]} raycast={() => null}>
        <coneGeometry args={[Math.max(1.6, length * 0.07), coneH, 16]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
      </mesh>
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

