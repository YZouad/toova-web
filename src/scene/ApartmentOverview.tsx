import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  resolveApartmentRooms,
  type ApartmentRoom,
} from '../lib/apartmentRooms';
import { pickItemUnderRay } from '../lib/pickItemUnderPointer';
import { roomTagDef } from '../lib/roomTags';
import { getApartmentMode, useStore } from '../store';
import { DOLLHOUSE_CUT_HEIGHT } from './dollhouseClip';

const FLOOR_Y = 0.15;
const OUTLINE_Y = DOLLHOUSE_CUT_HEIGHT + 0.5;

function facePoints(room: ApartmentRoom, y: number): [number, number, number][] {
  const pts: [number, number, number][] = room.face.map((v) => [v.x, y, v.z]);
  if (pts.length > 0) pts.push(pts[0]!);
  return pts;
}

function FloorHighlight({ room }: { room: ApartmentRoom }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    if (room.face.length === 0) return s;
    s.moveTo(room.face[0]!.x, room.face[0]!.z);
    for (let i = 1; i < room.face.length; i++) {
      s.lineTo(room.face[i]!.x, room.face[i]!.z);
    }
    s.closePath();
    return s;
  }, [room.face]);

  const geo = useMemo(() => new THREE.ShapeGeometry(shape), [shape]);
  useEffect(() => () => geo.dispose(), [geo]);

  const color = room.tag ? roomTagDef(room.tag).color : 'rgb(180,170,150)';
  const fill = opaqueColor(color);

  // Same +X rotation as FloorMesh: shape Y maps to world +Z (−PI/2 mirrors across z=0).
  return (
    <mesh
      geometry={geo}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, FLOOR_Y, 0]}
      renderOrder={2}
      raycast={noRaycast}
    >
      <meshBasicMaterial
        color={fill}
        transparent
        opacity={0.4}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function noRaycast() {}

/** THREE.Color ignores alpha (and warns); keep the hue, drive alpha via opacity. */
function opaqueColor(css: string): string {
  const m = css.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  return m ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : css;
}

function RoomLabel({
  room,
  emphasized,
}: {
  room: ApartmentRoom;
  emphasized: boolean;
}) {
  const areaSqFt = Math.round(room.areaSqIn / 144);
  return (
    <Html
      position={[room.labelAnchor[0], OUTLINE_Y + 8, room.labelAnchor[1]]}
      center
      style={{ pointerEvents: 'none', opacity: emphasized ? 1 : 0.72 }}
    >
      <div
        className="dg-apt-label"
        style={{
          padding: emphasized ? '6px 10px' : '4px 8px',
          borderRadius: 4,
          background: emphasized ? 'rgba(248,243,234,0.96)' : 'rgba(248,243,234,0.78)',
          border: '1px solid rgba(60,50,40,0.18)',
          font: '600 12px/1.2 var(--font-sans, system-ui)',
          color: '#2c241c',
          whiteSpace: 'nowrap',
          boxShadow: emphasized ? '0 4px 14px rgba(40,30,20,0.12)' : 'none',
        }}
      >
        {room.label}
        <span style={{ opacity: 0.55, fontWeight: 500 }}> · {areaSqFt} sq ft</span>
      </div>
    </Html>
  );
}

export interface ApartmentOverviewProps {
  onFocusRoom: (roomId: string) => void;
  onNameRoom: (room: ApartmentRoom) => void;
  highlightedId: string | null;
  onHighlight: (roomId: string | null) => void;
}

/**
 * Dollhouse overlay: analytic floor picking, tinted faces, cut-height outlines,
 * and room labels. Mounted only in apartment overview mode.
 *
 * Furniture clicks select the item and stay in overview (drag still works).
 * Empty-floor clicks focus / name the room.
 */
export function ApartmentOverview({
  onFocusRoom,
  onNameRoom,
  highlightedId,
  onHighlight,
}: ApartmentOverviewProps) {
  const roomGeometry = useStore((s) => s.roomGeometry);
  const focusedRoomId = useStore((s) => s.focusedRoomId);
  const mode = getApartmentMode({ roomGeometry, focusedRoomId });
  const rooms = useMemo(() => resolveApartmentRooms(roomGeometry), [roomGeometry]);
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);
  const pendingTapRef = useRef<{ roomId: string; at: number } | null>(null);
  const [isCoarse, setIsCoarse] = useState(false);
  const callbacksRef = useRef({ onFocusRoom, onNameRoom, onHighlight });
  callbacksRef.current = { onFocusRoom, onNameRoom, onHighlight };

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => setIsCoarse(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const setRayFromClient = (clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
  };

  const pickRoom = (clientX: number, clientY: number): ApartmentRoom | null => {
    setRayFromClient(clientX, clientY);
    const hit = raycaster.ray.intersectPlane(floorPlane, hitPoint);
    if (!hit) return null;
    return (
      rooms.find((r) => {
        const face = r.face;
        let inside = false;
        for (let i = 0, j = face.length - 1; i < face.length; j = i++) {
          const xi = face[i]!.x;
          const zi = face[i]!.z;
          const xj = face[j]!.x;
          const zj = face[j]!.z;
          const intersect =
            zi > hitPoint.z !== zj > hitPoint.z &&
            hitPoint.x < ((xj - xi) * (hitPoint.z - zi)) / (zj - zi + 1e-9) + xi;
          if (intersect) inside = !inside;
        }
        return inside;
      }) ?? null
    );
  };

  useEffect(() => {
    if (mode !== 'overview') return;
    const el = gl.domElement;
    let down: { x: number; y: number; pointerId: number } | null = null;

    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      // Warm the focus shell during the press so pointerup does not compile shaders.
      if (!isCoarse) {
        const room = pickRoom(e.clientX, e.clientY);
        if (room) callbacksRef.current.onHighlight(room.id);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!down || down.pointerId !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 8) return;

      const { onFocusRoom, onNameRoom, onHighlight } = callbacksRef.current;
      setRayFromClient(e.clientX, e.clientY);

      // Furniture wins over the floor — select and stay in overview.
      const floorHit = raycaster.ray.intersectPlane(floorPlane, hitPoint);
      const floorDist = floorHit ? raycaster.ray.origin.distanceTo(floorHit) : Infinity;
      const items = Object.values(useStore.getState().items);
      const itemHit = pickItemUnderRay(raycaster.ray, items, floorDist + 1);
      if (itemHit) {
        pendingTapRef.current = null;
        useStore.getState().select(itemHit.id);
        return;
      }

      const room = pickRoom(e.clientX, e.clientY);
      if (!room) {
        onHighlight(null);
        pendingTapRef.current = null;
        return;
      }
      if (isCoarse) {
        const pending = pendingTapRef.current;
        if (pending && pending.roomId === room.id && performance.now() - pending.at < 700) {
          pendingTapRef.current = null;
          if (room.tagged) onFocusRoom(room.id);
          else onNameRoom(room);
          return;
        }
        pendingTapRef.current = { roomId: room.id, at: performance.now() };
        onHighlight(room.id);
        return;
      }
      if (room.tagged) onFocusRoom(room.id);
      else onNameRoom(room);
    };
    const onMove = (e: PointerEvent) => {
      if (isCoarse) return;
      // Skip hover work while a drag may be in progress.
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      const room = pickRoom(e.clientX, e.clientY);
      callbacksRef.current.onHighlight(room?.id ?? null);
    };
    const onLeave = () => {
      if (!isCoarse) callbacksRef.current.onHighlight(null);
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [mode, gl, camera, rooms, isCoarse, ndc, raycaster, floorPlane, hitPoint]);

  if (mode !== 'overview') return null;

  return (
    <group>
      {rooms.map((room) => {
        const active = highlightedId === room.id;
        const outline = facePoints(room, OUTLINE_Y);
        const color = room.tag ? roomTagDef(room.tag).stroke : '#8a8074';
        return (
          <group key={room.id}>
            {active ? <FloorHighlight room={room} /> : null}
            <Line
              points={outline}
              color={active ? '#2c241c' : color}
              lineWidth={active ? 2.5 : 1.25}
              transparent
              opacity={active ? 0.95 : 0.65}
              raycast={noRaycast}
            />
            <RoomLabel room={room} emphasized={active} />
          </group>
        );
      })}
    </group>
  );
}
