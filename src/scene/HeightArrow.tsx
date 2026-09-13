import { useEffect, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

const _hit = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

export const GIZMO_BLUE = '#3a4a5c';
export const GIZMO_BLUE_HOT = '#536274';

function clientToRay(camera: THREE.Camera, gl: THREE.WebGLRenderer, clientX: number, clientY: number) {
  const rect = gl.domElement.getBoundingClientRect();
  _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_ndc, camera);
  return _raycaster.ray;
}

/** World-space vertical arrow — drag along Y to change height. */
export function HeightArrow({
  position,
  baseY,
  length,
  color = GIZMO_BLUE,
  colorHot = GIZMO_BLUE_HOT,
  onLift,
  onDragStart,
  onDragEnd,
}: {
  position: [number, number, number];
  baseY: number;
  length: number;
  color?: string;
  colorHot?: string;
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
  const stroke = hovered || active ? colorHot : color;

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
        color={stroke}
        lineWidth={2}
        transparent
        opacity={0.95}
        depthTest={false}
        raycast={() => null}
      />
      <mesh position={[0, shaftH + coneH / 2, 0]} raycast={() => null}>
        <coneGeometry args={[Math.max(1.6, length * 0.07), coneH, 16]} />
        <meshBasicMaterial color={stroke} depthTest={false} transparent opacity={0.95} />
      </mesh>
    </group>
  );
}
