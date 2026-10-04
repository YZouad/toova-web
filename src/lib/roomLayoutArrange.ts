import { FURNITURE, isWallShelfKind, type FurnitureKind, type GalleryFurnitureKind } from '../furniture/registry';
import { defaultWallShelfPose } from '../interaction/collision';
import type { Item } from '../store';
import { isChecklistRug } from './checklistPublicGlbs';
import {
  aabbsOverlap,
  doorFootprintAABBs,
  footprintBlocksDoor,
  rotatedFootprintAabb,
  type FootprintAabb,
} from './floorClearance';
import {
  allWallSegments,
  type FloorPlan,
  type FloorPlanVertex,
  type WallSegment,
} from './floorPlanGeometry';

export type LayoutVariant = 0 | 1 | 2;
export const LAYOUT_VARIANT_COUNT = 3;

/** Center of wall poster art from floor (inches). */
export const WALL_POSTER_CENTER_Y = 57;

const WALL_INSET = 4;
const PIECE_GAP = 8;
const CHAIR_GAP = 10;

type WallSpan = { start: number; end: number };
type WallOccupancy = Map<string, WallSpan[]>;

export interface ArrangeResult {
  items: Item[];
  movedIds: string[];
  skippedIds: string[];
}

type ItemRole =
  | 'bed'
  | 'nightstand'
  | 'lamp'
  | 'desk'
  | 'chair'
  | 'storage'
  | 'rug'
  | 'wallPoster'
  | 'shelf'
  | 'leftover'
  | 'skip';

interface PlacedItem {
  item: Item;
  cx: number;
  cz: number;
  rotationY: number;
  positionY: number;
  aabb: FootprintAabb;
  role: ItemRole;
  /** Sitting on the floor inside a bed's leg clearance. */
  tuckedUnderBed?: boolean;
}

interface FloorOrientation {
  widthAlong: number;
  depthIn: number;
  rotationOffset: number;
  size: [number, number, number];
}

function inwardRotationY(seg: WallSegment): number {
  return Math.atan2(-seg.outward[0], -seg.outward[1]);
}

function doorBlockedIntervals(plan: FloorPlan, seg: WallSegment): Array<{ start: number; end: number }> {
  const doors = doorFootprintAABBs(plan);
  const intervals: Array<{ start: number; end: number }> = [];
  const [tx, tz] = seg.tangent;
  const sx = seg.start.x;
  const sz = seg.start.z;

  for (const door of doors) {
    const corners: Array<[number, number]> = [
      [door.minX, door.minZ],
      [door.maxX, door.minZ],
      [door.maxX, door.maxZ],
      [door.minX, door.maxZ],
    ];
    let minT = Infinity;
    let maxT = -Infinity;
    for (const [x, z] of corners) {
      const t = (x - sx) * tx + (z - sz) * tz;
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }
    if (maxT > 0 && minT < seg.length) {
      intervals.push({
        start: Math.max(0, minT - PIECE_GAP),
        end: Math.min(seg.length, maxT + PIECE_GAP),
      });
    }
  }
  return intervals;
}

function windowBlockedIntervals(plan: FloorPlan, seg: WallSegment): WallSpan[] {
  const intervals: WallSpan[] = [];
  for (const opening of plan.openings) {
    if (opening.kind !== 'window' || opening.wallId !== seg.wall.id) continue;
    intervals.push({
      start: Math.max(0, opening.offset - PIECE_GAP),
      end: Math.min(seg.length, opening.offset + opening.width + PIECE_GAP),
    });
  }
  return intervals;
}

function coversWindow(plan: FloorPlan, seg: WallSegment, tStart: number, tEnd: number): boolean {
  return windowBlockedIntervals(plan, seg).some((span) => tStart < span.end && tEnd > span.start);
}

function intervalOverlaps(
  start: number,
  end: number,
  blocked: Array<{ start: number; end: number }>,
): boolean {
  return blocked.some((b) => start < b.end && end > b.start);
}

function forwardXZ(rotationY: number): [number, number] {
  return [Math.sin(rotationY), Math.cos(rotationY)];
}

function itemFootprintSize(item: Item): [number, number, number] {
  return [item.size[0], item.size[1], item.size[2]];
}

function floorOrientations(item: Item): FloorOrientation[] {
  const [w, h, d] = itemFootprintSize(item);
  if (item.kind !== 'bed') {
    return [{ widthAlong: w, depthIn: d, rotationOffset: 0, size: [w, h, d] }];
  }
  return [
    { widthAlong: w, depthIn: d, rotationOffset: 0, size: [w, h, d] },
    { widthAlong: d, depthIn: w, rotationOffset: Math.PI / 2, size: [d, h, w] },
  ];
}

function classifyItem(item: Item): ItemRole {
  if (item.kind === 'hanging' || item.kind === 'light') return 'skip';
  if (isWallShelfKind(item.kind)) return 'shelf';
  if (item.kind === 'bed') return 'bed';
  if (item.kind === 'nightstand') return 'nightstand';
  if (item.kind === 'lamp') return 'lamp';
  if (item.kind === 'desk') return 'desk';
  if (item.kind === 'chair') return 'chair';
  if (item.kind === 'dresser' || item.kind === 'wardrobe' || item.kind === 'bookshelf') return 'storage';
  if (item.kind === 'imported') {
    if (item.wallMounted) return 'wallPoster';
    if (isChecklistRug(item)) return 'rug';
  }
  const label = (item.label ?? '').toLowerCase();
  if (/\b(nightstand|side table)\b/.test(label)) return 'nightstand';
  if (/\bdesk\b/.test(label)) return 'desk';
  if (/\bchair\b/.test(label)) return 'chair';
  if (/\b(bed|mattress|bed frame)\b/.test(label)) return 'bed';
  if (/\b(dresser|wardrobe|cabinet|storage|bookshelf|filing)\b/.test(label)) return 'storage';
  if (/\brug\b/.test(label)) return 'rug';
  if (/\b(poster|artwork|wall art|canvas|print)\b/.test(label)) return 'wallPoster';
  if (/\blamp\b/.test(label)) return 'lamp';
  return 'leftover';
}

function hostTopY(host: PlacedItem): number {
  if (host.item.kind === 'imported') return host.item.size[1];
  if (host.role === 'bed') return host.item.size[1];
  return FURNITURE[host.item.kind as GalleryFurnitureKind].size[1];
}

function isFloorBlockerRole(role: ItemRole): boolean {
  return (
    role !== 'skip' &&
    role !== 'lamp' &&
    role !== 'wallPoster' &&
    role !== 'rug' &&
    role !== 'shelf'
  );
}

/** Floor items that participate in XZ collision. Rugs, lamps, posters, and shelves do not. */
function blockingPlaced(placed: PlacedItem[]): PlacedItem[] {
  return placed.filter(
    (p) => isFloorBlockerRole(p.role) && p.positionY < 1 && !p.tuckedUnderBed,
  );
}

function bedLegClearance(item: Item): number {
  if (item.bedLegHeight != null && item.bedLegHeight > 0) return item.bedLegHeight;
  if (item.kind === 'bed' || classifyItem(item) === 'bed') return FURNITURE.bed.clearance ?? 8;
  return 0;
}

function aabbContains(outer: FootprintAabb, inner: FootprintAabb, pad = 2): boolean {
  return (
    inner.minX >= outer.minX - pad &&
    inner.maxX <= outer.maxX + pad &&
    inner.minZ >= outer.minZ - pad &&
    inner.maxZ <= outer.maxZ + pad
  );
}

function tuckedUnderHost(item: Item, host: Item): boolean {
  const clearance = bedLegClearance(host);
  if (clearance < 4 || item.id === host.id || item.size[1] > clearance - 0.5) return false;
  const hostBox = rotatedFootprintAabb(
    host.position[0],
    host.position[2],
    host.size[0],
    host.size[2],
    host.rotationY,
  );
  const itemBox = rotatedFootprintAabb(
    item.position[0],
    item.position[2],
    item.size[0],
    item.size[2],
    item.rotationY,
  );
  return aabbContains(hostBox, itemBox);
}

function wallSpanBlocked(
  tStart: number,
  tEnd: number,
  blocked: WallSpan[],
): boolean {
  return intervalOverlaps(tStart, tEnd, blocked);
}

function markWallSpan(
  wallId: string,
  tStart: number,
  tEnd: number,
  occupancy: WallOccupancy,
): void {
  const spans = occupancy.get(wallId) ?? [];
  spans.push({ start: tStart - PIECE_GAP, end: tEnd + PIECE_GAP });
  occupancy.set(wallId, spans);
}

function canPlace(
  plan: FloorPlan,
  cx: number,
  cz: number,
  width: number,
  depth: number,
  rotationY: number,
  placed: PlacedItem[],
  doors: FootprintAabb[],
): boolean {
  if (footprintBlocksDoor(plan, cx, cz, width, depth, rotationY, doors)) return false;
  const aabb = rotatedFootprintAabb(cx, cz, width, depth, rotationY);
  return !blockingPlaced(placed).some((p) => aabbsOverlap(aabb, p.aabb));
}

export function floorLayoutHasOverlaps(items: Item[]): boolean {
  const floor = items.filter((it) => {
    const role = classifyItem(it);
    return (
      role !== 'skip' &&
      role !== 'lamp' &&
      role !== 'wallPoster' &&
      role !== 'rug' &&
      it.position[1] < 1
    );
  });
  for (let i = 0; i < floor.length; i++) {
    for (let j = i + 1; j < floor.length; j++) {
      const a = floor[i]!;
      const b = floor[j]!;
      const boxA = rotatedFootprintAabb(
        a.position[0],
        a.position[2],
        a.size[0],
        a.size[2],
        a.rotationY,
      );
      const boxB = rotatedFootprintAabb(
        b.position[0],
        b.position[2],
        b.size[0],
        b.size[2],
        b.rotationY,
      );
      if (tuckedUnderHost(a, b) || tuckedUnderHost(b, a)) continue;
      if (aabbsOverlap(boxA, boxB)) return true;
    }
  }
  return false;
}

function placeOnWall(
  plan: FloorPlan,
  item: Item,
  role: ItemRole,
  seg: WallSegment,
  tAlong: number,
  orient: FloorOrientation,
  placed: PlacedItem[],
  doors: FootprintAabb[],
  occupancy: WallOccupancy,
): PlacedItem | null {
  const rotationY = inwardRotationY(seg) + orient.rotationOffset;
  const blocked = [
    ...doorBlockedIntervals(plan, seg),
    ...(occupancy.get(seg.wall.id) ?? []),
  ];
  const widthAlong = orient.widthAlong;
  const depthIn = orient.depthIn;
  const tStart = tAlong - widthAlong / 2;
  const tEnd = tAlong + widthAlong / 2;
  if (wallSpanBlocked(tStart, tEnd, blocked)) return null;
  if (tStart < PIECE_GAP || tEnd > seg.length - PIECE_GAP) return null;

  const [tx, tz] = seg.tangent;
  const interiorX = -seg.outward[0];
  const interiorZ = -seg.outward[1];
  const inset = depthIn / 2 + WALL_INSET;
  const cx = seg.start.x + tx * tAlong + interiorX * inset;
  const cz = seg.start.z + tz * tAlong + interiorZ * inset;

  if (!canPlace(plan, cx, cz, orient.size[0], orient.size[2], rotationY, placed, doors)) {
    return null;
  }

  const aabb = rotatedFootprintAabb(cx, cz, orient.size[0], orient.size[2], rotationY);
  const sizedItem =
    orient.rotationOffset === 0 || item.kind !== 'bed'
      ? item
      : { ...item, size: orient.size };

  markWallSpan(seg.wall.id, tStart, tEnd, occupancy);

  return {
    item: sizedItem,
    cx,
    cz,
    rotationY,
    positionY: 0,
    aabb,
    role,
  };
}

function tryPlaceOnWallCenter(
  plan: FloorPlan,
  item: Item,
  role: ItemRole,
  seg: WallSegment,
  placed: PlacedItem[],
  doors: FootprintAabb[],
  occupancy: WallOccupancy,
  tOverride?: number,
): PlacedItem | null {
  for (const orient of floorOrientations(item)) {
    const tAlong = tOverride ?? seg.length / 2;
    const placedItem = placeOnWall(
      plan,
      item,
      role,
      seg,
      tAlong,
      orient,
      placed,
      doors,
      occupancy,
    );
    if (placedItem) return placedItem;
  }
  return null;
}

function tryPlaceOnWallGreedy(
  plan: FloorPlan,
  item: Item,
  role: ItemRole,
  walls: WallSegment[],
  wallCursors: Map<string, number>,
  placed: PlacedItem[],
  doors: FootprintAabb[],
  occupancy: WallOccupancy,
  avoidWindows = false,
): PlacedItem | null {
  for (const orient of floorOrientations(item)) {
    for (const seg of walls) {
      const widthAlong = orient.widthAlong;
      const blocked = [
        ...doorBlockedIntervals(plan, seg),
        ...(avoidWindows ? windowBlockedIntervals(plan, seg) : []),
        ...(occupancy.get(seg.wall.id) ?? []),
      ];
      let cursor = wallCursors.get(seg.wall.id) ?? PIECE_GAP + widthAlong / 2;
      const [tx, tz] = seg.tangent;
      const interiorX = -seg.outward[0];
      const interiorZ = -seg.outward[1];
      const inset = orient.depthIn / 2 + WALL_INSET;
      const rotationY = inwardRotationY(seg) + orient.rotationOffset;

      while (cursor + widthAlong / 2 + PIECE_GAP <= seg.length) {
        const tStart = cursor - widthAlong / 2;
        const tEnd = cursor + widthAlong / 2;
        if (wallSpanBlocked(tStart, tEnd, blocked)) {
          const nextBlock = blocked.find((b) => tStart < b.end && tEnd > b.start);
          cursor = (nextBlock?.end ?? tEnd) + PIECE_GAP + widthAlong / 2;
          continue;
        }

        const cx = seg.start.x + tx * cursor + interiorX * inset;
        const cz = seg.start.z + tz * cursor + interiorZ * inset;
        if (
          canPlace(plan, cx, cz, orient.size[0], orient.size[2], rotationY, placed, doors)
        ) {
          const aabb = rotatedFootprintAabb(cx, cz, orient.size[0], orient.size[2], rotationY);
          const sizedItem =
            orient.rotationOffset === 0 || item.kind !== 'bed'
              ? item
              : { ...item, size: orient.size };
          markWallSpan(seg.wall.id, tStart, tEnd, occupancy);
          wallCursors.set(seg.wall.id, tEnd + PIECE_GAP + widthAlong / 2);
          return {
            item: sizedItem,
            cx,
            cz,
            rotationY,
            positionY: 0,
            aabb,
            role,
          };
        }
        cursor += widthAlong + PIECE_GAP;
      }
    }
  }
  return null;
}

function isStackableStorage(item: Item): boolean {
  if (item.kind === 'dresser' || item.kind === 'bookshelf') return true;
  const label = (item.label ?? '').toLowerCase();
  if (/\bwardrobe\b/.test(label)) return false;
  return /\b(dresser|bookshelf|bookcase)\b/.test(label);
}

interface StorageColumn {
  seg: WallSegment;
  tAlong: number;
  baseWidth: number;
  topY: number;
  count: number;
}

const MAX_STACK = 2;

function canTuckUnderBed(item: Item, role: ItemRole): boolean {
  return role !== 'desk' && item.kind !== 'desk' && classifyItem(item) !== 'desk';
}

function poseAgainstWall(
  seg: WallSegment,
  item: Item,
  role: ItemRole,
  tAlong: number,
  positionY: number,
): PlacedItem {
  const orient = floorOrientations(item)[0]!;
  const rotationY = inwardRotationY(seg) + orient.rotationOffset;
  const [tx, tz] = seg.tangent;
  const inset = orient.depthIn / 2 + WALL_INSET;
  const cx = seg.start.x + tx * tAlong - seg.outward[0] * inset;
  const cz = seg.start.z + tz * tAlong - seg.outward[1] * inset;
  const sizedItem =
    orient.rotationOffset === 0 || item.kind !== 'bed' ? item : { ...item, size: orient.size };
  return {
    item: sizedItem,
    cx,
    cz,
    rotationY,
    positionY,
    aabb: rotatedFootprintAabb(cx, cz, orient.size[0], orient.size[2], rotationY),
    role,
  };
}

function wallAnchor(
  walls: WallSegment[],
  placedItem: PlacedItem,
): { seg: WallSegment; tAlong: number } | null {
  let best: { seg: WallSegment; tAlong: number; err: number } | null = null;
  for (const seg of walls) {
    const rot = inwardRotationY(seg);
    const dRot = Math.atan2(
      Math.sin(placedItem.rotationY - rot),
      Math.cos(placedItem.rotationY - rot),
    );
    if (Math.abs(dRot) > 0.25) continue;
    const [tx, tz] = seg.tangent;
    const tAlong = (placedItem.cx - seg.start.x) * tx + (placedItem.cz - seg.start.z) * tz;
    const inward = -(
      (placedItem.cx - seg.start.x) * seg.outward[0] +
      (placedItem.cz - seg.start.z) * seg.outward[1]
    );
    const expected = placedItem.item.size[2] / 2 + WALL_INSET;
    const err = Math.abs(inward - expected);
    if (err > 10 || tAlong < -8 || tAlong > seg.length + 8) continue;
    if (!best || err < best.err) best = { seg, tAlong, err };
  }
  return best ? { seg: best.seg, tAlong: best.tAlong } : null;
}

/** Upper dresser or bookshelf, back flush to the same wall as the piece under it. */
function stackOnColumn(item: Item, role: ItemRole, column: StorageColumn): PlacedItem {
  return poseAgainstWall(column.seg, item, role, column.tAlong, column.topY);
}

function overlapArea(a: FootprintAabb, b: FootprintAabb): number {
  const width = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const depth = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (width <= 0 || depth <= 0) return 0;
  return width * depth;
}

function placeUnderBed(bed: PlacedItem, item: Item, placed: PlacedItem[]): PlacedItem | null {
  const clearance = bedLegClearance(bed.item);
  if (clearance < 4 || item.size[1] > clearance - 0.5) return null;
  const others = placed.filter((p) => p.tuckedUnderBed);
  const bedW = bed.aabb.maxX - bed.aabb.minX;
  const bedD = bed.aabb.maxZ - bed.aabb.minZ;
  for (const rotationY of [bed.rotationY, bed.rotationY + Math.PI / 2]) {
    const probe = rotatedFootprintAabb(0, 0, item.size[0], item.size[2], rotationY);
    const itemW = probe.maxX - probe.minX;
    const itemD = probe.maxZ - probe.minZ;
    if (itemW > bedW - 2 || itemD > bedD - 2) continue;
    const x0 = bed.aabb.minX + itemW / 2 + 1;
    const x1 = bed.aabb.maxX - itemW / 2 - 1;
    const z0 = bed.aabb.minZ + itemD / 2 + 1;
    const z1 = bed.aabb.maxZ - itemD / 2 - 1;
    for (let x = x0; x <= x1 + 0.01; x += 4) {
      for (let z = z0; z <= z1 + 0.01; z += 4) {
        const aabb = rotatedFootprintAabb(x, z, item.size[0], item.size[2], rotationY);
        if (!aabbContains(bed.aabb, aabb, 1) || others.some((p) => aabbsOverlap(aabb, p.aabb))) {
          continue;
        }
        return {
          item,
          cx: x,
          cz: z,
          rotationY,
          positionY: 0,
          aabb,
          role: classifyItem(item),
          tuckedUnderBed: true,
        };
      }
    }
  }
  return null;
}

/** Last resort: flush to a wall, preferring a spot that does not overlap. */
function forceFlushToWall(
  plan: FloorPlan,
  item: Item,
  role: ItemRole,
  walls: WallSegment[],
  placed: PlacedItem[],
  doors: FootprintAabb[],
  occupancy: WallOccupancy,
  avoidWindows = false,
): PlacedItem | null {
  const orient = floorOrientations(item)[0];
  if (!orient || walls.length === 0) return null;
  for (const seg of walls) {
    const gap = 2;
    const start = orient.widthAlong / 2 + gap;
    const end = seg.length - orient.widthAlong / 2 - gap;
    if (start > end) continue;
    for (let t = start; t <= end; t += 4) {
      const pose = poseAgainstWall(seg, item, role, t, 0);
      if (avoidWindows && coversWindow(plan, seg, t - orient.widthAlong / 2, t + orient.widthAlong / 2)) {
        continue;
      }
      if (
        footprintBlocksDoor(
          plan,
          pose.cx,
          pose.cz,
          orient.size[0],
          orient.size[2],
          pose.rotationY,
          doors,
        )
      ) {
        continue;
      }
      let area = 0;
      for (const other of blockingPlaced(placed)) area += overlapArea(pose.aabb, other.aabb);
      if (area === 0) {
        markWallSpan(seg.wall.id, t - orient.widthAlong / 2, t + orient.widthAlong / 2, occupancy);
        return pose;
      }
    }
  }
  return null;
}

function tFromCorner(seg: WallSegment, vertex: FloorPlanVertex, widthAlong: number): number {
  if (seg.start.id === vertex.id) {
    return PIECE_GAP + widthAlong / 2;
  }
  return seg.length - PIECE_GAP - widthAlong / 2;
}

function adjacentWallPairs(
  plan: FloorPlan,
): Array<{ segA: WallSegment; segB: WallSegment; vertex: FloorPlanVertex }> {
  const segs = allWallSegments(plan);
  const pairs: Array<{ segA: WallSegment; segB: WallSegment; vertex: FloorPlanVertex }> = [];
  for (const vertex of plan.vertices) {
    const atVertex = segs.filter((s) => s.start.id === vertex.id || s.end.id === vertex.id);
    if (atVertex.length === 2) {
      const [a, b] = atVertex;
      const segA = a!.length >= b!.length ? a! : b!;
      const segB = a!.length >= b!.length ? b! : a!;
      pairs.push({ segA, segB, vertex });
    }
  }
  return pairs;
}

function pickBedWall(
  plan: FloorPlan,
  item: Item,
  variant: LayoutVariant,
  walls: WallSegment[],
): { seg: WallSegment; tAlong: number } | null {
  const sorted = [...walls].sort((a, b) => b.length - a.length);
  const doors = doorFootprintAABBs(plan);
  const probeOccupancy: WallOccupancy = new Map();

  if (variant === 2) {
    const corners = adjacentWallPairs(plan).sort(
      (a, b) => b.segA.length + b.segB.length - (a.segA.length + a.segB.length),
    );
    for (const { segA, vertex } of corners) {
      for (const orient of floorOrientations(item)) {
        const tAlong = tFromCorner(segA, vertex, orient.widthAlong);
        const placedItem = placeOnWall(
          plan,
          item,
          'bed',
          segA,
          tAlong,
          orient,
          [],
          doors,
          probeOccupancy,
        );
        if (placedItem) {
          return { seg: segA, tAlong };
        }
      }
    }
    return null;
  }

  const startIndex = variant === 0 ? 0 : Math.min(1, sorted.length - 1);
  for (let i = startIndex; i < sorted.length; i++) {
    const seg = sorted[i]!;
    for (const orient of floorOrientations(item)) {
      const tAlong = seg.length / 2;
      const placedItem = placeOnWall(
        plan,
        item,
        'bed',
        seg,
        tAlong,
        orient,
        [],
        doors,
        probeOccupancy,
      );
      if (placedItem) {
        return { seg, tAlong };
      }
    }
  }
  return null;
}

function oppositeWall(bedSeg: WallSegment, walls: WallSegment[]): WallSegment | null {
  const candidates = walls.filter((w) => w.wall.id !== bedSeg.wall.id);
  if (candidates.length === 0) return null;
  const bedMid = [
    (bedSeg.start.x + bedSeg.end.x) / 2,
    (bedSeg.start.z + bedSeg.end.z) / 2,
  ] as const;
  let best: WallSegment | null = null;
  let bestDist = -1;
  for (const seg of candidates) {
    const mid = [(seg.start.x + seg.end.x) / 2, (seg.start.z + seg.end.z) / 2] as const;
    const dist = Math.hypot(mid[0] - bedMid[0], mid[1] - bedMid[1]);
    if (dist > bestDist) {
      bestDist = dist;
      best = seg;
    }
  }
  return best;
}

function halfExtentAlongWall(item: PlacedItem, seg: WallSegment): number {
  const [tx, tz] = seg.tangent;
  const hw = item.item.size[0] / 2;
  const hd = item.item.size[2] / 2;
  const c = Math.cos(item.rotationY);
  const s = Math.sin(item.rotationY);
  const corners: Array<[number, number]> = [
    [hw, hd],
    [hw, -hd],
    [-hw, hd],
    [-hw, -hd],
  ];
  let maxAlong = 0;
  for (const [lx, lz] of corners) {
    const wx = lx * c + lz * s;
    const wz = -lx * s + lz * c;
    maxAlong = Math.max(maxAlong, Math.abs(wx * tx + wz * tz));
  }
  return maxAlong;
}

function placeNightstandBesideBed(
  plan: FloorPlan,
  item: Item,
  bed: PlacedItem,
  bedSeg: WallSegment,
  side: 'left' | 'right',
  placed: PlacedItem[],
  doors: FootprintAabb[],
  occupancy: WallOccupancy,
): PlacedItem | null {
  const [tx, tz] = bedSeg.tangent;
  const bedHalfAlong = halfExtentAlongWall(bed, bedSeg);
  const nsWidth = item.size[0];
  const offset =
    side === 'right'
      ? bedHalfAlong + PIECE_GAP + nsWidth / 2
      : -(bedHalfAlong + PIECE_GAP + nsWidth / 2);

  const bedT =
    (bed.cx - bedSeg.start.x) * tx + (bed.cz - bedSeg.start.z) * tz;
  const tAlong = bedT + offset;

  return tryPlaceOnWallCenter(
    plan,
    item,
    'nightstand',
    bedSeg,
    placed,
    doors,
    occupancy,
    tAlong,
  );
}

function placeChairAtDesk(
  plan: FloorPlan,
  chair: Item,
  desk: PlacedItem,
  placed: PlacedItem[],
  doors: FootprintAabb[],
): PlacedItem | null {
  const [fx, fz] = forwardXZ(desk.rotationY);
  const deskDepth = desk.item.size[2];
  const chairDepth = chair.size[2];
  const dist = deskDepth / 2 + CHAIR_GAP + chairDepth / 2;
  const cx = desk.cx + fx * dist;
  const cz = desk.cz + fz * dist;
  const rotationY = desk.rotationY + Math.PI;

  if (!canPlace(plan, cx, cz, chair.size[0], chair.size[2], rotationY, placed, doors)) {
    return null;
  }

  return {
    item: chair,
    cx,
    cz,
    rotationY,
    positionY: 0,
    aabb: rotatedFootprintAabb(cx, cz, chair.size[0], chair.size[2], rotationY),
    role: 'chair',
  };
}

function placeRugUnderBed(bed: PlacedItem, rug: Item): PlacedItem {
  return {
    item: rug,
    cx: bed.cx,
    cz: bed.cz,
    rotationY: bed.rotationY,
    positionY: 0,
    aabb: rotatedFootprintAabb(bed.cx, bed.cz, rug.size[0], rug.size[2], bed.rotationY),
    role: 'rug',
  };
}

function placeWallPoster(
  plan: FloorPlan,
  item: Item,
  preferredWall: WallSegment | null,
  placed: PlacedItem[],
  doors: FootprintAabb[],
): PlacedItem | null {
  const walls = allWallSegments(plan).sort((a, b) => b.length - a.length);
  const ordered = preferredWall
    ? [preferredWall, ...walls.filter((w) => w.wall.id !== preferredWall.wall.id)]
    : walls;
  const widthAlong = item.size[0];
  const depthIn = item.size[2];
  const bottomY = Math.max(0, WALL_POSTER_CENTER_Y - item.size[1] / 2);

  for (const seg of ordered) {
    const rotationY = inwardRotationY(seg);
    const blocked = doorBlockedIntervals(plan, seg);
    let cursor = PIECE_GAP + widthAlong / 2;
    const [tx, tz] = seg.tangent;
    const interiorX = -seg.outward[0];
    const interiorZ = -seg.outward[1];
    const inset = depthIn / 2 + WALL_INSET;

    while (cursor + widthAlong / 2 + PIECE_GAP <= seg.length) {
      const tStart = cursor - widthAlong / 2;
      const tEnd = cursor + widthAlong / 2;
      if (intervalOverlaps(tStart, tEnd, blocked)) {
        const nextBlock = blocked.find((b) => tStart < b.end && tEnd > b.start);
        cursor = (nextBlock?.end ?? tEnd) + PIECE_GAP + widthAlong / 2;
        continue;
      }

      const cx = seg.start.x + tx * cursor + interiorX * inset;
      const cz = seg.start.z + tz * cursor + interiorZ * inset;
      const floorOverlap = placed.some(
        (p) =>
          p.role !== 'wallPoster' &&
          aabbsOverlap(rotatedFootprintAabb(cx, cz, widthAlong, depthIn, rotationY), p.aabb),
      );
      if (floorOverlap) {
        cursor += widthAlong + PIECE_GAP;
        continue;
      }

      if (!canPlace(plan, cx, cz, widthAlong, depthIn, rotationY, placed, doors)) {
        cursor += widthAlong + PIECE_GAP;
        continue;
      }

      return {
        item,
        cx,
        cz,
        rotationY,
        positionY: bottomY,
        aabb: rotatedFootprintAabb(cx, cz, widthAlong, depthIn, rotationY),
        role: 'wallPoster',
      };
    }
  }
  return null;
}

function findLampHost(
  hosts: PlacedItem[],
  usedHostKeys: Set<string>,
): PlacedItem | null {
  const priority: ItemRole[] = ['nightstand', 'desk', 'storage'];
  for (const role of priority) {
    const host = hosts.find(
      (h) => h.role === role && !usedHostKeys.has(`${h.cx},${h.cz}`),
    );
    if (host) return host;
  }
  return null;
}

const SURFACE_Y_TOLERANCE = 6;
const SURFACE_XZ_PAD = 4;

interface SurfaceRider {
  item: Item;
  hostId: string;
  lx: number;
  lz: number;
  yFromTop: number;
  yawOffset: number;
}

function canHostSurface(item: Item): boolean {
  const role = classifyItem(item);
  return (
    role === 'desk' ||
    role === 'nightstand' ||
    role === 'storage' ||
    role === 'bed' ||
    role === 'leftover'
  );
}

function footprintContains(host: Item, x: number, z: number, pad: number): boolean {
  const box = rotatedFootprintAabb(
    host.position[0],
    host.position[2],
    host.size[0],
    host.size[2],
    host.rotationY,
  );
  return x >= box.minX - pad && x <= box.maxX + pad && z >= box.minZ - pad && z <= box.maxZ + pad;
}

/** Items already resting on a desk, nightstand, dresser, or bed. They move with that piece. */
function collectSurfaceRiders(items: Item[]): SurfaceRider[] {
  const hosts = items.filter(canHostSurface);
  const riders: SurfaceRider[] = [];
  for (const item of items) {
    if (item.position[1] < 8) continue;
    const role = classifyItem(item);
    if (
      role === 'skip' ||
      role === 'shelf' ||
      role === 'wallPoster' ||
      role === 'rug' ||
      role === 'bed' ||
      role === 'desk' ||
      role === 'storage' ||
      role === 'nightstand' ||
      role === 'chair'
    ) {
      continue;
    }
    let best: Item | null = null;
    let bestArea = Infinity;
    for (const host of hosts) {
      if (host.id === item.id) continue;
      const top = host.position[1] + host.size[1];
      if (Math.abs(item.position[1] - top) > SURFACE_Y_TOLERANCE) continue;
      if (!footprintContains(host, item.position[0], item.position[2], SURFACE_XZ_PAD)) continue;
      const area = host.size[0] * host.size[2];
      if (item.size[0] * item.size[2] > area * 0.85) continue;
      if (area < bestArea) {
        best = host;
        bestArea = area;
      }
    }
    if (!best) continue;
    const dx = item.position[0] - best.position[0];
    const dz = item.position[2] - best.position[2];
    const c = Math.cos(best.rotationY);
    const s = Math.sin(best.rotationY);
    riders.push({
      item,
      hostId: best.id,
      lx: dx * c - dz * s,
      lz: dx * s + dz * c,
      yFromTop: item.position[1] - (best.position[1] + best.size[1]),
      yawOffset: item.rotationY - best.rotationY,
    });
  }
  return riders;
}

function placeSurfaceRiders(riders: SurfaceRider[], placed: PlacedItem[]): void {
  for (const rider of riders) {
    const host = placed.find((p) => p.item.id === rider.hostId);
    if (!host) continue;
    const c = Math.cos(host.rotationY);
    const s = Math.sin(host.rotationY);
    const cx = host.cx + rider.lx * c + rider.lz * s;
    const cz = host.cz - rider.lx * s + rider.lz * c;
    const rotationY = host.rotationY + rider.yawOffset;
    const positionY = host.positionY + host.item.size[1] + rider.yFromTop;
    placed.push({
      item: rider.item,
      cx,
      cz,
      rotationY,
      positionY,
      aabb: rotatedFootprintAabb(cx, cz, rider.item.size[0], rider.item.size[2], rotationY),
      role: classifyItem(rider.item),
    });
  }
}

function placedToItem(p: PlacedItem): Item {
  return {
    ...p.item,
    position: [p.cx, p.positionY, p.cz],
    rotationY: p.rotationY,
  };
}

function buildArrangeResult(
  items: Item[],
  placed: PlacedItem[],
  skippedIds: string[],
): ArrangeResult {
  const placedById = new Map(placed.map((p) => [p.item.id, placedToItem(p)]));
  const movedIds: string[] = [];
  const result: Item[] = [];

  for (const item of items) {
    if (classifyItem(item) === 'skip') {
      result.push(item);
      continue;
    }
    const next = placedById.get(item.id);
    if (!next) {
      result.push(item);
      if (!skippedIds.includes(item.id)) skippedIds.push(item.id);
      continue;
    }
    const moved =
      next.position[0] !== item.position[0] ||
      next.position[1] !== item.position[1] ||
      next.position[2] !== item.position[2] ||
      next.rotationY !== item.rotationY;
    if (moved) movedIds.push(item.id);
    result.push(next);
  }

  return { items: result, movedIds, skippedIds };
}

/** Role-aware furniture arrangement for a floor plan. Skips hanging decor and ceiling lights. */
export function arrangeRoomItems(
  plan: FloorPlan,
  items: Item[],
  variant: LayoutVariant,
): ArrangeResult {
  const skippedIds: string[] = [];
  const placed: PlacedItem[] = [];
  const doors = doorFootprintAABBs(plan);
  const walls = allWallSegments(plan).sort((a, b) => b.length - a.length);
  const wallCursors = new Map<string, number>();
  const occupancy: WallOccupancy = new Map();
  const riders = collectSurfaceRiders(items);
  const riderIds = new Set(riders.map((rider) => rider.item.id));

  const byRole = new Map<ItemRole, Item[]>();
  const unchanged: Item[] = [];

  for (const item of items) {
    if (riderIds.has(item.id)) continue;
    const role = classifyItem(item);
    if (role === 'skip') {
      unchanged.push(item);
      continue;
    }
    const list = byRole.get(role) ?? [];
    list.push(item);
    byRole.set(role, list);
  }

  const beds = byRole.get('bed') ?? [];
  const nightstands = byRole.get('nightstand') ?? [];
  const desks = byRole.get('desk') ?? [];
  const chairs = byRole.get('chair') ?? [];
  const storage = byRole.get('storage') ?? [];
  const rugs = byRole.get('rug') ?? [];
  const posters = byRole.get('wallPoster') ?? [];
  const lamps = byRole.get('lamp') ?? [];
  const shelves = byRole.get('shelf') ?? [];
  const leftovers = byRole.get('leftover') ?? [];

  let bedWall: WallSegment | null = null;
  let bedPlacement: PlacedItem | null = null;

  if (beds.length > 0) {
    const bed = beds[0]!;
    const pick = pickBedWall(plan, bed, variant, walls);
    if (!pick) {
      return { items, movedIds: [], skippedIds: items.map((it) => it.id) };
    }
    bedWall = pick.seg;
    for (const orient of floorOrientations(bed)) {
      const p = placeOnWall(
        plan,
        bed,
        'bed',
        pick.seg,
        pick.tAlong,
        orient,
        placed,
        doors,
        occupancy,
      );
      if (p) {
        bedPlacement = p;
        placed.push(p);
        break;
      }
    }
    if (!bedPlacement) {
      return { items, movedIds: [], skippedIds: items.map((it) => it.id) };
    }
    for (const extraBed of beds.slice(1)) {
      const p = tryPlaceOnWallGreedy(
        plan,
        extraBed,
        'bed',
        walls,
        wallCursors,
        placed,
        doors,
        occupancy,
      );
      if (p) placed.push(p);
      else skippedIds.push(extraBed.id);
    }
  }

  if (bedPlacement && bedWall) {
    if (nightstands[0]) {
      const ns = placeNightstandBesideBed(
        plan,
        nightstands[0],
        bedPlacement,
        bedWall,
        'right',
        placed,
        doors,
        occupancy,
      );
      if (ns) placed.push(ns);
      else skippedIds.push(nightstands[0].id);
    }
    if (nightstands[1]) {
      const ns = placeNightstandBesideBed(
        plan,
        nightstands[1],
        bedPlacement,
        bedWall,
        'left',
        placed,
        doors,
        occupancy,
      );
      if (ns) placed.push(ns);
      else skippedIds.push(nightstands[1].id);
    }
    for (const ns of nightstands.slice(2)) {
      const p = tryPlaceOnWallGreedy(
        plan,
        ns,
        'nightstand',
        walls,
        wallCursors,
        placed,
        doors,
        occupancy,
      );
      if (p) placed.push(p);
      else skippedIds.push(ns.id);
    }

    if (rugs[0]) {
      placed.push(placeRugUnderBed(bedPlacement, rugs[0]));
    }
    for (const rug of rugs.slice(1)) {
      const p = tryPlaceOnWallGreedy(
        plan,
        rug,
        'rug',
        walls,
        wallCursors,
        placed,
        doors,
        occupancy,
      );
      if (p) placed.push(p);
      else skippedIds.push(rug.id);
    }
  } else {
    for (const ns of nightstands) {
      const p = tryPlaceOnWallGreedy(
        plan,
        ns,
        'nightstand',
        walls,
        wallCursors,
        placed,
        doors,
        occupancy,
      );
      if (p) placed.push(p);
      else skippedIds.push(ns.id);
    }
    for (const rug of rugs) {
      const p = tryPlaceOnWallGreedy(
        plan,
        rug,
        'rug',
        walls,
        wallCursors,
        placed,
        doors,
        occupancy,
      );
      if (p) placed.push(p);
      else skippedIds.push(rug.id);
    }
  }

  const deskWall =
    bedWall != null ? oppositeWall(bedWall, walls) : walls[variant === 0 ? 0 : Math.min(1, walls.length - 1)] ?? null;

  let deskPlacement: PlacedItem | null = null;
  if (desks[0] && deskWall) {
    deskPlacement = tryPlaceOnWallCenter(
      plan,
      desks[0],
      'desk',
      deskWall,
      placed,
      doors,
      occupancy,
    );
    if (deskPlacement) placed.push(deskPlacement);
    else skippedIds.push(desks[0].id);
  }
  for (const desk of desks.slice(1)) {
    const p = tryPlaceOnWallGreedy(
      plan,
      desk,
      'desk',
      walls,
      wallCursors,
      placed,
      doors,
      occupancy,
    );
    if (p) placed.push(p);
    else skippedIds.push(desk.id);
  }

  const chairDesk = deskPlacement;
  const chairCandidates = [...chairs];
  if (chairDesk && chairCandidates[0]) {
    const chair = placeChairAtDesk(plan, chairCandidates[0], chairDesk, placed, doors);
    if (chair) {
      placed.push(chair);
      chairCandidates.shift();
    }
  }
  for (const chair of chairCandidates) {
    const p = tryPlaceOnWallGreedy(
      plan,
      chair,
      'chair',
      walls,
      wallCursors,
      placed,
      doors,
      occupancy,
    );
    if (p) placed.push(p);
    else skippedIds.push(chair.id);
  }

  const columns: StorageColumn[] = [];
  const rememberColumn = (piece: PlacedItem) => {
    if (piece.positionY > 1 || piece.tuckedUnderBed) return;
    const anchor = wallAnchor(walls, piece);
    if (!anchor) return;
    columns.push({
      seg: anchor.seg,
      tAlong: anchor.tAlong,
      baseWidth: piece.item.size[0],
      topY: piece.positionY + piece.item.size[1],
      count: 1,
    });
  };
  const tuckUnderBed = (piece: Item, role: ItemRole): PlacedItem | null => {
    if (!bedPlacement || !canTuckUnderBed(piece, role)) return null;
    return placeUnderBed(bedPlacement, piece, placed);
  };
  const placeAgainstWall = (piece: Item, role: ItemRole): PlacedItem | null => {
    if (role === 'leftover') {
      const under = tuckUnderBed(piece, role);
      if (under) return under;
    }
    const onWall = tryPlaceOnWallGreedy(
      plan,
      piece,
      role,
      walls,
      wallCursors,
      placed,
      doors,
      occupancy,
    );
    if (onWall) return onWall;
    const under = tuckUnderBed(piece, role);
    if (under) return under;
    return forceFlushToWall(plan, piece, role, walls, placed, doors, occupancy);
  };
  const placeOnWallPreferClear = (
    piece: Item,
    role: ItemRole,
  ): PlacedItem | null =>
    tryPlaceOnWallGreedy(plan, piece, role, walls, wallCursors, placed, doors, occupancy, true) ??
    tryPlaceOnWallGreedy(plan, piece, role, walls, wallCursors, placed, doors, occupancy, false) ??
    forceFlushToWall(plan, piece, role, walls, placed, doors, occupancy, true) ??
    forceFlushToWall(plan, piece, role, walls, placed, doors, occupancy, false);

  const floorStorage = storage.filter((piece) => !isStackableStorage(piece));
  const stackable = storage
    .filter(isStackableStorage)
    .sort((a, b) => b.size[0] - a.size[0] || b.size[2] - a.size[2]);

  for (const piece of floorStorage) {
    const p = placeOnWallPreferClear(piece, 'storage');
    if (p) placed.push(p);
    else skippedIds.push(piece.id);
  }

  const ceiling = plan.height;
  const fitsOnColumn = (piece: Item, col: StorageColumn) =>
    col.count < MAX_STACK &&
    piece.size[0] <= col.baseWidth + 2 &&
    col.topY + piece.size[1] <= ceiling;
  for (const piece of stackable) {
    const onClearWall = tryPlaceOnWallGreedy(
      plan,
      piece,
      'storage',
      walls,
      wallCursors,
      placed,
      doors,
      occupancy,
      true,
    );
    if (onClearWall) {
      placed.push(onClearWall);
      rememberColumn(onClearWall);
      continue;
    }
    const clearColumn = columns.find(
      (col) =>
        fitsOnColumn(piece, col) &&
        !coversWindow(plan, col.seg, col.tAlong - col.baseWidth / 2, col.tAlong + col.baseWidth / 2),
    );
    const onAnyWall =
      clearColumn == null
        ? tryPlaceOnWallGreedy(plan, piece, 'storage', walls, wallCursors, placed, doors, occupancy, false)
        : null;
    if (onAnyWall) {
      placed.push(onAnyWall);
      rememberColumn(onAnyWall);
      continue;
    }
    const column = clearColumn ?? columns.find((col) => fitsOnColumn(piece, col));
    if (column) {
      placed.push(stackOnColumn(piece, 'storage', column));
      column.topY += piece.size[1];
      column.count += 1;
      continue;
    }
    const forced = forceFlushToWall(plan, piece, 'storage', walls, placed, doors, occupancy, false);
    if (forced) {
      placed.push(forced);
      rememberColumn(forced);
      continue;
    }
    const under = tuckUnderBed(piece, 'storage');
    if (under) placed.push(under);
    else skippedIds.push(piece.id);
  }

  for (const poster of posters) {
    const p = placeWallPoster(plan, poster, bedWall, placed, doors);
    if (p) placed.push(p);
    else skippedIds.push(poster.id);
  }

  for (const piece of leftovers) {
    const p = placeAgainstWall(piece, 'leftover');
    if (p) placed.push(p);
    else skippedIds.push(piece.id);
  }

  const usedLampHosts = new Set<string>();
  const floorHosts = placed.filter((p) => p.role !== 'lamp' && p.role !== 'wallPoster');
  for (const lamp of lamps) {
    const host = findLampHost(floorHosts, usedLampHosts);
    if (!host) {
      skippedIds.push(lamp.id);
      continue;
    }
    usedLampHosts.add(`${host.cx},${host.cz}`);
    const lampY = hostTopY(host);
    const aabb = rotatedFootprintAabb(
      host.cx,
      host.cz,
      lamp.size[0],
      lamp.size[2],
      host.rotationY,
    );
    placed.push({
      item: lamp,
      cx: host.cx,
      cz: host.cz,
      rotationY: host.rotationY,
      positionY: lampY,
      aabb,
      role: 'lamp',
    });
  }

  for (const shelf of shelves) {
    const pose = defaultWallShelfPose(plan, shelf.size);
    placed.push({
      item: shelf,
      cx: pose.position[0],
      cz: pose.position[2],
      rotationY: pose.rotationY,
      positionY: pose.position[1],
      aabb: rotatedFootprintAabb(
        pose.position[0],
        pose.position[2],
        shelf.size[0],
        shelf.size[2],
        pose.rotationY,
      ),
      role: 'shelf',
    });
  }

  placeSurfaceRiders(riders, placed);

  const placedIds = new Set(placed.map((p) => p.item.id));
  const unplaced = items.filter(
    (item) =>
      classifyItem(item) !== 'skip' && !placedIds.has(item.id) && !riderIds.has(item.id),
  );
  for (const item of unplaced) {
    const role = classifyItem(item);
    if (role === 'wallPoster' || role === 'shelf' || role === 'rug' || role === 'skip') continue;
    const p = placeAgainstWall(item, role);
    if (p) {
      placed.push(p);
      const idx = skippedIds.indexOf(item.id);
      if (idx >= 0) skippedIds.splice(idx, 1);
    }
  }

  return buildArrangeResult(items, placed, skippedIds);
}

/** Returns true when at least one floor furniture item can be rearranged. */
export function roomHasShuffleableFloorItems(items: Item[]): boolean {
  return items.some((item) => {
    const role = classifyItem(item);
    return role !== 'skip' && role !== 'shelf';
  });
}
