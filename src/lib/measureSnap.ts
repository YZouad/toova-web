import * as THREE from 'three';
import type { Item } from '../store';
import { itemRect } from '../interaction/collision';
import {
  GRID_SNAP_IN,
  allWallSegments,
  getWallSegment,
  orderedVertices,
  snapToGrid,
  wallById,
  type FloorPlan,
} from './floorPlanGeometry';
import type { MeasureHit, MeasureSnapKind } from './measurePick';
import type { MeasureVec3 } from './measureDistance';
import { worldToScreen } from './measureScreen';

export interface MeasureSnapCandidate {
  point: MeasureVec3;
  kind: Exclude<MeasureSnapKind, null>;
}

export const MEASURE_SNAP_PX_DESKTOP = 12;
export const MEASURE_SNAP_PX_TOUCH = 20;

function dist3(a: MeasureVec3, b: MeasureVec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** World-space corners of an item's analytic AABB (bottom + top). */
export function itemBboxCorners(item: Item): MeasureVec3[] {
  const [w, h, d] = item.size;
  const [px, py, pz] = item.position;
  const c = Math.cos(item.rotationY);
  const s = Math.sin(item.rotationY);
  const halfW = w / 2;
  const halfD = d / 2;
  const locals: [number, number][] = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ];
  const out: MeasureVec3[] = [];
  for (const [lx, lz] of locals) {
    const wx = px + lx * c + lz * s;
    const wz = pz - lx * s + lz * c;
    out.push([wx, py, wz]);
    out.push([wx, py + h, wz]);
  }
  return out;
}

/** Face centers of an item's analytic AABB. */
export function itemFaceCenters(item: Item): MeasureVec3[] {
  const [w, h, d] = item.size;
  const [px, py, pz] = item.position;
  const c = Math.cos(item.rotationY);
  const s = Math.sin(item.rotationY);
  const midY = py + h / 2;
  const halfW = w / 2;
  const halfD = d / 2;
  const faceLocal: [number, number][] = [
    [0, -halfD],
    [0, halfD],
    [-halfW, 0],
    [halfW, 0],
  ];
  const out: MeasureVec3[] = [
    [px, py, pz],
    [px, py + h, pz],
  ];
  for (const [lx, lz] of faceLocal) {
    out.push([px + lx * c + lz * s, midY, pz - lx * s + lz * c]);
  }
  return out;
}

export function collectSnapCandidates(
  hit: MeasureHit,
  room: FloorPlan,
  items: Record<string, Item>,
): MeasureSnapCandidate[] {
  const candidates: MeasureSnapCandidate[] = [];
  const push = (point: MeasureVec3, kind: Exclude<MeasureSnapKind, null>) => {
    candidates.push({ point, kind });
  };

  if (hit.wallId) {
    const wall = wallById(room, hit.wallId);
    const seg = wall ? getWallSegment(room, wall) : null;
    if (seg) {
      const y = hit.point[1];
      push([seg.start.x, y, seg.start.z], 'corner');
      push([seg.end.x, y, seg.end.z], 'corner');
      push(
        [(seg.start.x + seg.end.x) / 2, y, (seg.start.z + seg.end.z) / 2],
        'wall',
      );
      push([seg.start.x, 0, seg.start.z], 'corner');
      push([seg.end.x, 0, seg.end.z], 'corner');
      push([seg.start.x, room.height, seg.start.z], 'corner');
      push([seg.end.x, room.height, seg.end.z], 'corner');
    }
  }

  if (hit.itemId) {
    const item = items[hit.itemId];
    if (item && item.kind !== 'hanging' && item.kind !== 'light') {
      for (const p of itemBboxCorners(item)) push(p, 'corner');
      for (const p of itemFaceCenters(item)) push(p, 'edge');
    }
  }

  // Floor / open space: room corners, grid, furniture footprint corners at hit Y.
  const nearFloor = Math.abs(hit.point[1]) < 4;
  const nearCeiling = Math.abs(hit.point[1] - room.height) < 6;
  if (!hit.wallId && !hit.itemId) {
    const verts = orderedVertices(room);
    for (const v of verts) {
      push([v.x, hit.point[1], v.z], 'corner');
    }
    if (nearFloor || nearCeiling) {
      const gx = snapToGrid(hit.point[0], GRID_SNAP_IN);
      const gz = snapToGrid(hit.point[2], GRID_SNAP_IN);
      push([gx, hit.point[1], gz], 'grid');
    }
    for (const item of Object.values(items)) {
      if (item.kind === 'hanging' || item.kind === 'light') continue;
      const rect = itemRect(item);
      const corners: [number, number][] = [
        [rect.minX, rect.minZ],
        [rect.maxX, rect.minZ],
        [rect.maxX, rect.maxZ],
        [rect.minX, rect.maxZ],
      ];
      for (const [x, z] of corners) {
        push([x, hit.point[1], z], 'corner');
      }
    }
  }

  // Always offer wall segment endpoints near the hit for open floor picks.
  if (!hit.wallId && (nearFloor || nearCeiling)) {
    for (const seg of allWallSegments(room)) {
      push([seg.start.x, hit.point[1], seg.start.z], 'corner');
      push([seg.end.x, hit.point[1], seg.end.z], 'corner');
    }
  }

  return candidates;
}

/**
 * Pick the nearest snap candidate in screen space within `thresholdPx`.
 * Falls back to the raw hit when nothing is close enough.
 */
export function applyMeasureSnap(
  hit: MeasureHit,
  room: FloorPlan,
  items: Record<string, Item>,
  camera: THREE.Camera,
  canvasRect: DOMRect,
  thresholdPx: number,
): MeasureHit {
  const candidates = collectSnapCandidates(hit, room, items);
  if (candidates.length === 0) return { ...hit, snapKind: null };

  const hitScreen = worldToScreen(hit.point, camera, canvasRect);
  let best: MeasureSnapCandidate | null = null;
  let bestDist = thresholdPx + 1;

  for (const c of candidates) {
    // Prefer candidates near the hit in world space too (avoid snapping across the room).
    if (dist3(c.point, hit.point) > 36) continue;
    const screen = worldToScreen(c.point, camera, canvasRect);
    const d = Math.hypot(screen[0] - hitScreen[0], screen[1] - hitScreen[1]);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }

  if (!best) return { ...hit, snapKind: null };

  return {
    ...hit,
    point: best.point,
    snapKind: best.kind,
  };
}
