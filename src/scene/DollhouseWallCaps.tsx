import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  allWallSegments,
  doorOpenings,
  holesForWallSegment,
  openingWorldPlacement,
  type RoomGeometry,
} from '../lib/roomGeometry';
import { wallPaintColor, type RoomAppearance } from '../lib/roomAppearance';
import { MATERIAL_PRESETS } from '../lib/roomMaterials';
import { ROOM } from '../units';
import { useStore } from '../store';
import { dollhouseCutHeightFor, getDollhouseClipPlane } from './dollhouseClip';
import { DOOR_LEAF_COLOR, doorPartBoxes } from './Openings';
import {
  localSpanForTrim,
  spansMinusDoors,
  wallEndTrims,
  wallLocalToWorld,
} from './wallJoins';

type V2 = [number, number];

function pushCapQuad(
  loop: V2[],
  color: THREE.Color,
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  indices: number[],
) {
  const base = positions.length / 3;
  for (const [x, z] of loop) {
    positions.push(x, 0, z);
    normals.push(0, 1, 0);
    uvs.push(x, z);
    colors.push(color.r, color.g, color.b);
  }
  // Upward (Y) component of the face normal for points in the XZ plane:
  //   n_y = dz1*dx2 - dx1*dz2
  const dx1 = loop[1]![0] - loop[0]![0];
  const dz1 = loop[1]![1] - loop[0]![1];
  const dx2 = loop[2]![0] - loop[0]![0];
  const dz2 = loop[2]![1] - loop[0]![1];
  const ny = dz1 * dx2 - dx1 * dz2;
  if (ny >= 0) {
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  } else {
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
}

/** Door-local (lx, lz) → world XZ using the same Y-rotation as DoorUnit. */
function doorLocalToWorld(
  cx: number,
  cz: number,
  rotationY: number,
  lx: number,
  lz: number,
): V2 {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
}

function boxTopLoop(
  cx: number,
  cz: number,
  rotationY: number,
  center: [number, number, number],
  size: [number, number, number],
): V2[] {
  const hx = size[0] / 2;
  const hz = size[2] / 2;
  const lx = center[0];
  const lz = center[2];
  return [
    doorLocalToWorld(cx, cz, rotationY, lx - hx, lz - hz),
    doorLocalToWorld(cx, cz, rotationY, lx + hx, lz - hz),
    doorLocalToWorld(cx, cz, rotationY, lx + hx, lz + hz),
    doorLocalToWorld(cx, cz, rotationY, lx - hx, lz + hz),
  ];
}

/**
 * Cap quads for the dollhouse cut. Triangles are wound so the face normal
 * points +Y (up) — the old winding test used the wrong cross product and
 * culled every top from the overview camera.
 */
export function buildDollhouseCapGeometry(
  geom: RoomGeometry,
  appearance: RoomAppearance,
): THREE.BufferGeometry {
  const segments = allWallSegments(geom);
  const trims = wallEndTrims(segments, ROOM.wallThickness);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();
  const trimColor = new THREE.Color(
    MATERIAL_PRESETS[appearance.trimPreset]?.color ?? '#f5f2eb',
  );
  const leafColor = new THREE.Color(DOOR_LEAF_COLOR);

  segments.forEach((seg, i) => {
    const span = localSpanForTrim(seg, trims[i]!);
    const doors = holesForWallSegment(geom, seg).filter((h) => h.kind === 'door');
    const spans = spansMinusDoors(span.x0, span.x1, doors);
    color.set(wallPaintColor(appearance, seg.wall.id));

    for (const [x0, x1] of spans) {
      const loop = [
        wallLocalToWorld(seg, x0, 0),
        wallLocalToWorld(seg, x1, 0),
        wallLocalToWorld(seg, x1, ROOM.wallThickness),
        wallLocalToWorld(seg, x0, ROOM.wallThickness),
      ];
      pushCapQuad(loop, color, positions, normals, uvs, colors, indices);
    }
  });

  // Overview always draws doors closed — cap side jambs and the closed leaf.
  for (const door of doorOpenings(geom)) {
    const p = openingWorldPlacement(geom, door);
    if (!p) continue;
    const hinge = door.hinge === 'left' ? 'left' : 'right';
    const layout = doorPartBoxes(p.w, p.h, ROOM.wallThickness, hinge, true);
    for (const kind of ['leftJamb', 'rightJamb'] as const) {
      const box = layout.boxes.find((b) => b.kind === kind);
      if (!box) continue;
      pushCapQuad(
        boxTopLoop(p.cx, p.cz, p.rotationY, box.center, box.size),
        trimColor,
        positions,
        normals,
        uvs,
        colors,
        indices,
      );
    }
    const leaf = layout.boxes.find((b) => b.kind === 'leaf');
    if (leaf) {
      // Closed: leaf local centers are relative to the hinge group.
      const leafWorldCenter: [number, number, number] = [
        layout.hinge[0] + leaf.center[0],
        leaf.center[1],
        layout.hinge[2] + leaf.center[2],
      ];
      pushCapQuad(
        boxTopLoop(p.cx, p.cz, p.rotationY, leafWorldCenter, leaf.size),
        leafColor,
        positions,
        normals,
        uvs,
        colors,
        indices,
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  if (positions.length === 0) return geo;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Solid tops on the dollhouse cut. Clipping throws away the real wall top, so
 * each slab otherwise reads as the one vertical face you can see. These caps
 * follow the butt-joined footprint, so corners stay an L instead of a cross.
 */
export function DollhouseWallCaps({ geom }: { geom: RoomGeometry }) {
  const appearance = useStore((s) => s.environment.appearance);
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(
    () => buildDollhouseCapGeometry(geom, appearance),
    [geom, appearance],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(() => {
    // Unlit so the cut face stays the paint color from every angle. A lit top
    // goes dark along the grazing edge and reads as a black outline.
    return new THREE.MeshBasicMaterial({
      vertexColors: true,
      toneMapped: true,
      side: THREE.FrontSide,
    });
  }, []);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const mesh = meshRef.current;
    const parent = mesh?.parent;
    if (!mesh || !parent) return;
    parent.updateWorldMatrix(true, false);
    const parentY = parent.matrixWorld.elements[13] ?? 0;
    const cutLocal = getDollhouseClipPlane().constant - parentY;
    const y = Math.min(geom.height, cutLocal) - 0.04;
    mesh.position.y = y;
    mesh.visible = cutLocal < geom.height - 0.5 && geometry.getAttribute('position') != null;
  });

  if (!geometry.getAttribute('position')) return null;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[0, dollhouseCutHeightFor(geom) - 0.04, 0]}
      frustumCulled={false}
      renderOrder={2}
      raycast={() => {}}
    />
  );
}
