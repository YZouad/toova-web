import { FURNITURE, isWallShelfKind, type FurnitureKind, type GalleryFurnitureKind } from '../furniture/registry';
import { DEFAULT_SHELF_ELEVATION, defaultWallShelfPose } from '../interaction/collision';
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
  planCentroid,
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
/** Clear landing inside the door, deeper than the swing itself. */
const AISLE_DEPTH = 36;
/** Standing room kept in front of the bed when another spot exists. */
const BED_FOOT_CLEAR = 24;
/** Room to open wardrobe doors. */
const WARDROBE_SWING = 20;
/** How far a desk chair slides under the desktop. */
const CHAIR_TUCK = 8;
/** How far a smaller rug is pulled past the foot of the bed. */
const RUG_SHOW = 6;

type WallSpan = { start: number; end: number };
type WallOccupancy = Map<string, WallSpan[]>;

export interface ArrangeResult {
  items: Item[];
  movedIds: string[];
  skippedIds: string[];
}

export interface ArrangeOptions {
  /** Pieces that stay where they are. Everything else arranges around them. */
  pinnedIds?: readonly string[];
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
  | 'sofa'
  | 'coffeeTable'
  | 'diningTable'
  | 'screen'
  | 'mirror'
  | 'plant'
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
  const intervals: Array<{ start: number; end: number }> = [];
  for (const opening of plan.openings) {
    if (opening.kind !== 'door' || opening.wallId !== seg.wall.id) continue;
    intervals.push({
      start: Math.max(0, opening.offset - PIECE_GAP),
      end: Math.min(seg.length, opening.offset + opening.width + PIECE_GAP),
    });
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

function rotatesAgainstWall(item: Item): boolean {
  const role = classifyItem(item);
  return (
    role === 'bed' ||
    role === 'desk' ||
    role === 'storage' ||
    role === 'sofa' ||
    role === 'diningTable' ||
    role === 'coffeeTable' ||
    role === 'plant' ||
    role === 'leftover'
  );
}

function floorOrientations(item: Item): FloorOrientation[] {
  const [w, h, d] = itemFootprintSize(item);
  const primary: FloorOrientation = { widthAlong: w, depthIn: d, rotationOffset: 0, size: [w, h, d] };
  if (!rotatesAgainstWall(item) || Math.abs(w - d) < 2) return [primary];
  return [
    primary,
    { widthAlong: d, depthIn: w, rotationOffset: Math.PI / 2, size: [d, h, w] },
  ];
}

function withOrientSize(item: Item, orient: FloorOrientation): Item {
  if (orient.rotationOffset === 0) return item;
  return { ...item, size: orient.size };
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
  if (/\b(sofa|couch|loveseat)\b/.test(label)) return 'sofa';
  if (/\bcoffee table\b/.test(label)) return 'coffeeTable';
  if (/\bdining table\b/.test(label)) return 'diningTable';
  if (/\b(tv|television)\b/.test(label)) return 'screen';
  if (/\bmirror\b/.test(label)) return 'mirror';
  if (/\b(plant|planter)\b/.test(label)) return 'plant';
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
    role !== 'shelf' &&
    role !== 'screen' &&
    role !== 'mirror'
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
  reserved: FootprintAabb[] = [],
  honorReserved = true,
): boolean {
  if (footprintBlocksDoor(plan, cx, cz, width, depth, rotationY, doors)) return false;
  const aabb = rotatedFootprintAabb(cx, cz, width, depth, rotationY);
  if (honorReserved && reserved.some((zone) => aabbsOverlap(aabb, zone))) return false;
  return !blockingPlaced(placed).some((p) => aabbsOverlap(aabb, p.aabb));
}

/** A desk chair slid under its desk overlaps that desk on purpose. */
function isChairTuckedAtDesk(chair: Item, desk: Item): boolean {
  if (classifyItem(chair) !== 'chair' || classifyItem(desk) !== 'desk') return false;
  const target = desk.rotationY + Math.PI;
  const yaw = Math.atan2(Math.sin(chair.rotationY - target), Math.cos(chair.rotationY - target));
  if (Math.abs(yaw) > 0.4) return false;
  const [fx, fz] = forwardXZ(desk.rotationY);
  const dx = chair.position[0] - desk.position[0];
  const dz = chair.position[2] - desk.position[2];
  const along = dx * fx + dz * fz;
  const side = Math.abs(dx * fz + dz * -fx);
  if (along <= 4) return false;
  return along < desk.size[2] / 2 + chair.size[2] / 2 + 4 && side <= desk.size[0] / 2 + 2;
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
      if (isChairTuckedAtDesk(a, b) || isChairTuckedAtDesk(b, a)) continue;
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
  reserved: FootprintAabb[] = [],
  honorReserved = true,
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

  if (
    !canPlace(
      plan,
      cx,
      cz,
      orient.size[0],
      orient.size[2],
      rotationY,
      placed,
      doors,
      reserved,
      honorReserved,
    )
  ) {
    return null;
  }

  const aabb = rotatedFootprintAabb(cx, cz, orient.size[0], orient.size[2], rotationY);
  markWallSpan(seg.wall.id, tStart, tEnd, occupancy);

  return {
    item: withOrientSize(item, orient),
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
  reserved: FootprintAabb[] = [],
  honorReserved = true,
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
      reserved,
      honorReserved,
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
  reserved: FootprintAabb[] = [],
  honorReserved = true,
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
          canPlace(
            plan,
            cx,
            cz,
            orient.size[0],
            orient.size[2],
            rotationY,
            placed,
            doors,
            reserved,
            honorReserved,
          )
        ) {
          const aabb = rotatedFootprintAabb(cx, cz, orient.size[0], orient.size[2], rotationY);
          markWallSpan(seg.wall.id, tStart, tEnd, occupancy);
          wallCursors.set(seg.wall.id, tEnd + PIECE_GAP + widthAlong / 2);
          return {
            item: withOrientSize(item, orient),
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
  orient: FloorOrientation,
  positionY: number,
): PlacedItem {
  const rotationY = inwardRotationY(seg) + orient.rotationOffset;
  const [tx, tz] = seg.tangent;
  const inset = orient.depthIn / 2 + WALL_INSET;
  const cx = seg.start.x + tx * tAlong - seg.outward[0] * inset;
  const cz = seg.start.z + tz * tAlong - seg.outward[1] * inset;
  return {
    item: withOrientSize(item, orient),
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
  const orient = floorOrientations(item)[0]!;
  return poseAgainstWall(column.seg, item, role, column.tAlong, orient, column.topY);
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
  reserved: FootprintAabb[] = [],
  honorReserved = true,
): PlacedItem | null {
  if (walls.length === 0) return null;
  for (const orient of floorOrientations(item)) {
    for (const seg of walls) {
      const gap = 2;
      const start = orient.widthAlong / 2 + gap;
      const end = seg.length - orient.widthAlong / 2 - gap;
      if (start > end) continue;
      for (let t = start; t <= end; t += 4) {
        const pose = poseAgainstWall(seg, item, role, t, orient, 0);
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
        if (honorReserved && reserved.some((zone) => aabbsOverlap(pose.aabb, zone))) continue;
        let area = 0;
        for (const other of blockingPlaced(placed)) area += overlapArea(pose.aabb, other.aabb);
        if (area === 0) {
          markWallSpan(seg.wall.id, t - orient.widthAlong / 2, t + orient.widthAlong / 2, occupancy);
          return pose;
        }
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
  placed: PlacedItem[] = [],
  reserved: FootprintAabb[] = [],
  honorReserved = true,
): { seg: WallSegment; tAlong: number } | null {
  const sorted = [...walls].sort((a, b) => b.length - a.length);
  const doors = doorFootprintAABBs(plan);
  const probeOccupancy: WallOccupancy = new Map();

  const trySeg = (seg: WallSegment, tFor: (orient: FloorOrientation) => number) => {
    for (const orient of floorOrientations(item)) {
      const tAlong = tFor(orient);
      const placedItem = placeOnWall(
        plan,
        item,
        'bed',
        seg,
        tAlong,
        orient,
        placed,
        doors,
        probeOccupancy,
        reserved,
        honorReserved,
      );
      if (placedItem) return { seg, tAlong };
    }
    return null;
  };

  if (variant === 2) {
    const corners = adjacentWallPairs(plan).sort(
      (a, b) => b.segA.length + b.segB.length - (a.segA.length + b.segB.length),
    );
    for (const { segA, vertex } of corners) {
      const hit = trySeg(segA, (orient) => tFromCorner(segA, vertex, orient.widthAlong));
      if (hit) return hit;
    }
    return null;
  }

  if (variant === 1) {
    const seen = wallSeenFromDoor(plan, sorted);
    const ordered = seen
      ? [seen, ...sorted.filter((w) => w.wall.id !== seen.wall.id)]
      : sorted.slice(Math.min(1, sorted.length - 1));
    for (const seg of ordered) {
      const hit = trySeg(seg, () => seg.length / 2);
      if (hit) return hit;
    }
    return null;
  }

  for (const seg of sorted) {
    const hit = trySeg(seg, () => seg.length / 2);
    if (hit) return hit;
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
  reserved: FootprintAabb[] = [],
  honorReserved = true,
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
    reserved,
    honorReserved,
  );
}

function placeChairAtDesk(
  plan: FloorPlan,
  chair: Item,
  desk: PlacedItem,
  placed: PlacedItem[],
  doors: FootprintAabb[],
  reserved: FootprintAabb[] = [],
  honorReserved = true,
): PlacedItem | null {
  const others = placed.filter((p) => p.item.id !== desk.item.id);
  const [fx, fz] = forwardXZ(desk.rotationY);
  const rx = fz;
  const rz = -fx;
  const tuckDist = desk.item.size[2] / 2 + chair.size[2] / 2 - CHAIR_TUCK;
  const gapDist = desk.item.size[2] / 2 + CHAIR_GAP + chair.size[2] / 2;
  const sideDist = desk.item.size[0] / 2 + CHAIR_GAP + chair.size[0] / 2;
  const attempts: Array<{ cx: number; cz: number; rotationY: number }> = [
    {
      cx: desk.cx + fx * tuckDist,
      cz: desk.cz + fz * tuckDist,
      rotationY: desk.rotationY + Math.PI,
    },
    {
      cx: desk.cx + fx * gapDist,
      cz: desk.cz + fz * gapDist,
      rotationY: desk.rotationY + Math.PI,
    },
    {
      cx: desk.cx + rx * sideDist,
      cz: desk.cz + rz * sideDist,
      rotationY: Math.atan2(-rx, -rz),
    },
    {
      cx: desk.cx - rx * sideDist,
      cz: desk.cz - rz * sideDist,
      rotationY: Math.atan2(rx, rz),
    },
  ];

  for (const attempt of attempts) {
    if (
      !canPlace(
        plan,
        attempt.cx,
        attempt.cz,
        chair.size[0],
        chair.size[2],
        attempt.rotationY,
        others,
        doors,
        reserved,
        honorReserved,
      )
    ) {
      continue;
    }
    return {
      item: chair,
      cx: attempt.cx,
      cz: attempt.cz,
      rotationY: attempt.rotationY,
      positionY: 0,
      aabb: rotatedFootprintAabb(attempt.cx, attempt.cz, chair.size[0], chair.size[2], attempt.rotationY),
      role: 'chair',
    };
  }
  return null;
}

function placeRugUnderBed(bed: PlacedItem, rug: Item): PlacedItem {
  const [fx, fz] = forwardXZ(bed.rotationY);
  const bedDepth = bed.item.size[2];
  const rugDepth = rug.size[2];
  const shift = rugDepth < bedDepth - 1 ? (bedDepth - rugDepth) / 2 + RUG_SHOW : 0;
  const cx = bed.cx + fx * shift;
  const cz = bed.cz + fz * shift;
  return {
    item: rug,
    cx,
    cz,
    rotationY: bed.rotationY,
    positionY: 0,
    aabb: rotatedFootprintAabb(cx, cz, rug.size[0], rug.size[2], bed.rotationY),
    role: 'rug',
  };
}

function doorAisleAABBs(plan: FloorPlan): FootprintAabb[] {
  const boxes: FootprintAabb[] = [];
  for (const opening of plan.openings) {
    if (opening.kind !== 'door') continue;
    const seg = allWallSegments(plan).find((s) => s.wall.id === opening.wallId);
    if (!seg) continue;
    const [tx, tz] = seg.tangent;
    const inwardX = -seg.outward[0];
    const inwardZ = -seg.outward[1];
    const along = opening.offset + opening.width / 2;
    const cx = seg.start.x + tx * along + inwardX * (AISLE_DEPTH / 2);
    const cz = seg.start.z + tz * along + inwardZ * (AISLE_DEPTH / 2);
    boxes.push(rotatedFootprintAabb(cx, cz, opening.width, AISLE_DEPTH, Math.atan2(inwardX, inwardZ)));
  }
  return boxes;
}

function frontClearZone(piece: PlacedItem, clearDepth: number): FootprintAabb {
  const [fx, fz] = forwardXZ(piece.rotationY);
  const cx = piece.cx + fx * (piece.item.size[2] / 2 + clearDepth / 2);
  const cz = piece.cz + fz * (piece.item.size[2] / 2 + clearDepth / 2);
  return rotatedFootprintAabb(
    cx,
    cz,
    Math.max(piece.item.size[0] - 4, 8),
    clearDepth,
    piece.rotationY,
  );
}

function wallSeenFromDoor(plan: FloorPlan, walls: WallSegment[]): WallSegment | null {
  const door = plan.openings.find((o) => o.kind === 'door');
  if (!door) return null;
  const doorSeg = walls.find((w) => w.wall.id === door.wallId);
  if (!doorSeg) return null;
  return oppositeWall(doorSeg, walls);
}

function neighborWalls(plan: FloorPlan, seg: WallSegment): WallSegment[] {
  const out: WallSegment[] = [];
  for (const pair of adjacentWallPairs(plan)) {
    const other =
      pair.segA.wall.id === seg.wall.id
        ? pair.segB
        : pair.segB.wall.id === seg.wall.id
          ? pair.segA
          : null;
    if (other && !out.some((s) => s.wall.id === other.wall.id)) out.push(other);
  }
  return out;
}

function uniqueWalls(list: Array<WallSegment | null | undefined>): WallSegment[] {
  const out: WallSegment[] = [];
  for (const seg of list) {
    if (!seg) continue;
    if (out.some((s) => s.wall.id === seg.wall.id)) continue;
    out.push(seg);
  }
  return out;
}

function wallsWithWindows(plan: FloorPlan, walls: WallSegment[]): WallSegment[] {
  const ids = new Set(plan.openings.filter((o) => o.kind === 'window').map((o) => o.wallId));
  return walls.filter((w) => ids.has(w.wall.id));
}

function tOf(seg: WallSegment, x: number, z: number): number {
  const [tx, tz] = seg.tangent;
  return (x - seg.start.x) * tx + (z - seg.start.z) * tz;
}

function isWardrobeItem(item: Item): boolean {
  return item.kind === 'wardrobe' || /\bwardrobe\b/i.test(item.label ?? '');
}

function isBookshelfItem(item: Item): boolean {
  return item.kind === 'bookshelf' || /\b(bookshelf|bookcase)\b/i.test(item.label ?? '');
}

function prefersWardrobeCorner(item: Item): boolean {
  const label = (item.label ?? '').toLowerCase();
  if (/\bunder\b/.test(label)) return false;
  return /\b(hamper|laundry|basket)\b/.test(label);
}

function poseFromItem(item: Item, role: ItemRole): PlacedItem {
  return {
    item,
    cx: item.position[0],
    cz: item.position[2],
    rotationY: item.rotationY,
    positionY: item.position[1],
    aabb: rotatedFootprintAabb(item.position[0], item.position[2], item.size[0], item.size[2], item.rotationY),
    role,
  };
}

function occupyPlaced(walls: WallSegment[], piece: PlacedItem, occupancy: WallOccupancy): void {
  const anchor = wallAnchor(walls, piece);
  if (!anchor) return;
  const half = halfExtentAlongWall(piece, anchor.seg);
  markWallSpan(anchor.seg.wall.id, anchor.tAlong - half, anchor.tAlong + half, occupancy);
}

function deskWallOrder(
  plan: FloorPlan,
  variant: LayoutVariant,
  walls: WallSegment[],
  bedWall: WallSegment | null,
): WallSegment[] {
  const opposite = bedWall ? oppositeWall(bedWall, walls) : null;
  if (variant === 2 && bedWall) {
    return uniqueWalls([...neighborWalls(plan, bedWall), opposite, ...walls]);
  }
  const windows = wallsWithWindows(plan, walls).filter((w) => w.wall.id !== bedWall?.wall.id);
  return uniqueWalls([...windows, opposite, ...walls]);
}

function placeInOpenFloor(
  plan: FloorPlan,
  item: Item,
  role: ItemRole,
  placed: PlacedItem[],
  doors: FootprintAabb[],
  reserved: FootprintAabb[],
): PlacedItem | null {
  const [sx, sz] = planCentroid(plan);
  for (const honorReserved of [true, false]) {
    for (let radius = 0; radius <= 96; radius += 12) {
      const angles = radius === 0 ? [0] : [0, 45, 90, 135, 180, 225, 270, 315];
      for (const deg of angles) {
        const rad = (deg * Math.PI) / 180;
        const cx = sx + Math.cos(rad) * radius;
        const cz = sz + Math.sin(rad) * radius;
        for (const rotationY of [0, Math.PI / 2]) {
          if (
            !canPlace(
              plan,
              cx,
              cz,
              item.size[0],
              item.size[2],
              rotationY,
              placed,
              doors,
              reserved,
              honorReserved,
            )
          ) {
            continue;
          }
          return {
            item,
            cx,
            cz,
            rotationY,
            positionY: 0,
            aabb: rotatedFootprintAabb(cx, cz, item.size[0], item.size[2], rotationY),
            role,
          };
        }
      }
    }
  }
  return null;
}

function posterBottom(item: Item): number {
  return Math.max(0, WALL_POSTER_CENTER_Y - item.size[1] / 2);
}

function elevatedPose(
  item: Item,
  role: ItemRole,
  seg: WallSegment,
  tAlong: number,
  positionY: number,
  placed: PlacedItem[],
  plan: FloorPlan,
  avoidWindows: boolean,
): PlacedItem | null {
  const widthAlong = item.size[0];
  const depthIn = Math.max(item.size[2], 0.5);
  const tStart = tAlong - widthAlong / 2;
  const tEnd = tAlong + widthAlong / 2;
  if (tStart < PIECE_GAP || tEnd > seg.length - PIECE_GAP) return null;
  const blocked = [
    ...doorBlockedIntervals(plan, seg),
    ...(avoidWindows ? windowBlockedIntervals(plan, seg) : []),
  ];
  if (intervalOverlaps(tStart, tEnd, blocked)) return null;
  const rotationY = inwardRotationY(seg);
  const [tx, tz] = seg.tangent;
  const inset = depthIn / 2 + WALL_INSET;
  const cx = seg.start.x + tx * tAlong - seg.outward[0] * inset;
  const cz = seg.start.z + tz * tAlong - seg.outward[1] * inset;
  const aabb = rotatedFootprintAabb(cx, cz, widthAlong, depthIn, rotationY);
  const crowded = placed.some(
    (p) =>
      (p.role === 'wallPoster' || p.role === 'shelf' || p.role === 'screen' || p.role === 'mirror') &&
      Math.abs(p.positionY - positionY) < Math.max(item.size[1], p.item.size[1]) * 0.6 &&
      aabbsOverlap(aabb, p.aabb),
  );
  if (crowded) return null;
  return { item, cx, cz, rotationY, positionY, aabb, role };
}

function scanElevated(
  plan: FloorPlan,
  item: Item,
  role: ItemRole,
  walls: WallSegment[],
  positionY: number,
  placed: PlacedItem[],
  avoidWindows: boolean,
): PlacedItem | null {
  const widthAlong = item.size[0];
  for (const seg of walls) {
    const blocked = [
      ...doorBlockedIntervals(plan, seg),
      ...(avoidWindows ? windowBlockedIntervals(plan, seg) : []),
    ];
    let cursor = PIECE_GAP + widthAlong / 2;
    while (cursor + widthAlong / 2 + PIECE_GAP <= seg.length) {
      const tStart = cursor - widthAlong / 2;
      const tEnd = cursor + widthAlong / 2;
      if (intervalOverlaps(tStart, tEnd, blocked)) {
        const nextBlock = blocked.find((b) => tStart < b.end && tEnd > b.start);
        cursor = (nextBlock?.end ?? tEnd) + PIECE_GAP + widthAlong / 2;
        continue;
      }
      const pose = elevatedPose(item, role, seg, cursor, positionY, placed, plan, avoidWindows);
      if (pose) return pose;
      cursor += widthAlong + PIECE_GAP;
    }
  }
  return null;
}

function placeLampOnHost(lamp: Item, host: PlacedItem, occupants: PlacedItem[]): PlacedItem {
  const [fx, fz] = forwardXZ(host.rotationY);
  const rx = fz;
  const rz = -fx;
  const back = host.item.size[2] * 0.22;
  const lampY = hostTopY(host);
  for (const side of [0, 0.22, -0.22, 0.36, -0.36]) {
    const cx = host.cx - fx * back + rx * host.item.size[0] * side;
    const cz = host.cz - fz * back + rz * host.item.size[0] * side;
    if (cx < host.aabb.minX || cx > host.aabb.maxX || cz < host.aabb.minZ || cz > host.aabb.maxZ) continue;
    const aabb = rotatedFootprintAabb(cx, cz, lamp.size[0], lamp.size[2], host.rotationY);
    const hits = occupants.some(
      (p) =>
        p.item.id !== host.item.id &&
        p.role !== 'lamp' &&
        Math.abs(p.positionY - lampY) < 8 &&
        aabbsOverlap(aabb, p.aabb),
    );
    if (hits) continue;
    return { item: lamp, cx, cz, rotationY: host.rotationY, positionY: lampY, aabb, role: 'lamp' };
  }
  return {
    item: lamp,
    cx: host.cx,
    cz: host.cz,
    rotationY: host.rotationY,
    positionY: lampY,
    aabb: rotatedFootprintAabb(host.cx, host.cz, lamp.size[0], lamp.size[2], host.rotationY),
    role: 'lamp',
  };
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
  options?: ArrangeOptions,
): ArrangeResult {
  const skippedIds: string[] = [];
  const placed: PlacedItem[] = [];
  const doors = doorFootprintAABBs(plan);
  const walls = allWallSegments(plan).sort((a, b) => b.length - a.length);
  const wallCursors = new Map<string, number>();
  const occupancy: WallOccupancy = new Map();
  const reserved = doorAisleAABBs(plan);
  const pinnedIds = new Set(options?.pinnedIds ?? []);
  const riders = collectSurfaceRiders(items).filter((rider) => !pinnedIds.has(rider.item.id));
  const riderIds = new Set(riders.map((rider) => rider.item.id));

  const byRole = new Map<ItemRole, Item[]>();

  for (const item of items) {
    if (riderIds.has(item.id)) continue;
    const role = classifyItem(item);
    if (role === 'skip') continue;
    if (pinnedIds.has(item.id)) {
      const pose = poseFromItem(item, role);
      placed.push(pose);
      occupyPlaced(walls, pose, occupancy);
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
  const sofas = byRole.get('sofa') ?? [];
  const coffeeTables = byRole.get('coffeeTable') ?? [];
  const diningTables = byRole.get('diningTable') ?? [];
  const screens = byRole.get('screen') ?? [];
  const mirrors = byRole.get('mirror') ?? [];
  const plants = byRole.get('plant') ?? [];
  const leftovers = byRole.get('leftover') ?? [];

  const greedy = (
    piece: Item,
    role: ItemRole,
    wallList: WallSegment[] = walls,
    avoidWindows = false,
  ): PlacedItem | null =>
    tryPlaceOnWallGreedy(
      plan,
      piece,
      role,
      wallList,
      wallCursors,
      placed,
      doors,
      occupancy,
      avoidWindows,
      reserved,
      true,
    ) ??
    tryPlaceOnWallGreedy(
      plan,
      piece,
      role,
      wallList,
      wallCursors,
      placed,
      doors,
      occupancy,
      avoidWindows,
      reserved,
      false,
    );

  const flush = (
    piece: Item,
    role: ItemRole,
    wallList: WallSegment[] = walls,
    avoidWindows = false,
  ): PlacedItem | null =>
    forceFlushToWall(plan, piece, role, wallList, placed, doors, occupancy, avoidWindows, reserved, true) ??
    forceFlushToWall(plan, piece, role, wallList, placed, doors, occupancy, avoidWindows, reserved, false);

  let bedWall: WallSegment | null = null;
  let bedPlacement = placed.find((p) => p.role === 'bed') ?? null;
  if (bedPlacement) {
    bedWall = wallAnchor(walls, bedPlacement)?.seg ?? null;
    reserved.push(frontClearZone(bedPlacement, BED_FOOT_CLEAR));
  }

  const acceptBed = (pose: PlacedItem) => {
    bedPlacement = pose;
    placed.push(pose);
    bedWall = wallAnchor(walls, pose)?.seg ?? bedWall;
    reserved.push(frontClearZone(pose, BED_FOOT_CLEAR));
  };

  const placePrimaryBed = (bed: Item): PlacedItem | null => {
    const pick =
      pickBedWall(plan, bed, variant, walls, placed, reserved, true) ??
      pickBedWall(plan, bed, variant, walls, placed, reserved, false);
    if (!pick) return greedy(bed, 'bed');
    for (const honor of [true, false]) {
      for (const orient of floorOrientations(bed)) {
        const pose = placeOnWall(
          plan,
          bed,
          'bed',
          pick.seg,
          pick.tAlong,
          orient,
          placed,
          doors,
          occupancy,
          reserved,
          honor,
        );
        if (pose) return pose;
      }
    }
    return greedy(bed, 'bed');
  };

  if (!bedPlacement && beds.length > 0) {
    const pose = placePrimaryBed(beds[0]!);
    if (!pose) {
      return { items, movedIds: [], skippedIds: items.map((it) => it.id) };
    }
    acceptBed(pose);
    for (const extraBed of beds.slice(1)) {
      const p = greedy(extraBed, 'bed') ?? flush(extraBed, 'bed');
      if (p) placed.push(p);
      else skippedIds.push(extraBed.id);
    }
  } else {
    for (const extraBed of beds) {
      const p = greedy(extraBed, 'bed') ?? flush(extraBed, 'bed');
      if (p) placed.push(p);
      else skippedIds.push(extraBed.id);
    }
  }

  const placeBeside = (item: Item, side: 'left' | 'right'): PlacedItem | null => {
    if (!bedPlacement || !bedWall) return null;
    return (
      placeNightstandBesideBed(
        plan,
        item,
        bedPlacement,
        bedWall,
        side,
        placed,
        doors,
        occupancy,
        reserved,
        true,
      ) ??
      placeNightstandBesideBed(
        plan,
        item,
        bedPlacement,
        bedWall,
        side,
        placed,
        doors,
        occupancy,
        reserved,
        false,
      )
    );
  };

  if (bedPlacement && bedWall) {
    if (nightstands[0]) {
      const ns = placeBeside(nightstands[0], 'right') ?? placeBeside(nightstands[0], 'left');
      if (ns) placed.push(ns);
      else skippedIds.push(nightstands[0].id);
    }
    if (nightstands[1]) {
      const ns = placeBeside(nightstands[1], 'left') ?? placeBeside(nightstands[1], 'right');
      if (ns) placed.push(ns);
      else skippedIds.push(nightstands[1].id);
    }
    for (const ns of nightstands.slice(2)) {
      const p = greedy(ns, 'nightstand') ?? flush(ns, 'nightstand');
      if (p) placed.push(p);
      else skippedIds.push(ns.id);
    }
  } else {
    for (const ns of nightstands) {
      const p = greedy(ns, 'nightstand') ?? flush(ns, 'nightstand');
      if (p) placed.push(p);
      else skippedIds.push(ns.id);
    }
  }

  const looseRugs = [...rugs];
  if (bedPlacement && looseRugs.length > 0) {
    placed.push(placeRugUnderBed(bedPlacement, looseRugs.shift()!));
  }
  for (const rug of looseRugs) {
    const p = placeInOpenFloor(plan, rug, 'rug', placed, doors, reserved);
    if (p) placed.push(p);
    else skippedIds.push(rug.id);
  }

  const deskWalls = deskWallOrder(plan, variant, walls, bedWall);
  let deskPlacement: PlacedItem | null = null;
  const chairForDesk = chairs[0] ?? null;
  if (desks[0]) {
    for (const honor of [true, false]) {
      for (const seg of deskWalls) {
        const pose = tryPlaceOnWallCenter(
          plan,
          desks[0],
          'desk',
          seg,
          placed,
          doors,
          occupancy,
          undefined,
          reserved,
          honor,
        );
        if (!pose) continue;
        if (chairForDesk && honor) {
          const chairPose = placeChairAtDesk(
            plan,
            chairForDesk,
            pose,
            [...placed, pose],
            doors,
            reserved,
            true,
          );
          if (!chairPose) continue;
        }
        deskPlacement = pose;
        break;
      }
      if (deskPlacement) break;
    }
    if (deskPlacement) placed.push(deskPlacement);
    else skippedIds.push(desks[0].id);
  }
  for (const desk of desks.slice(1)) {
    const p = greedy(desk, 'desk') ?? flush(desk, 'desk');
    if (p) placed.push(p);
    else skippedIds.push(desk.id);
  }

  const chairCandidates = [...chairs];
  if (deskPlacement && chairCandidates[0]) {
    const chair =
      placeChairAtDesk(plan, chairCandidates[0], deskPlacement, placed, doors, reserved, true) ??
      placeChairAtDesk(plan, chairCandidates[0], deskPlacement, placed, doors, reserved, false);
    if (chair) {
      placed.push(chair);
      reserved.push(frontClearZone(chair, 16));
      chairCandidates.shift();
    }
  }

  const sofaWalls = uniqueWalls([
    ...(bedWall ? walls.filter((w) => w.wall.id !== bedWall.wall.id) : []),
    ...walls,
  ]);
  let sofaPlacement: PlacedItem | null = null;
  for (const sofa of sofas) {
    const p = greedy(sofa, 'sofa', sofaWalls) ?? flush(sofa, 'sofa', sofaWalls);
    if (p) {
      placed.push(p);
      if (!sofaPlacement) sofaPlacement = p;
    } else skippedIds.push(sofa.id);
  }
  for (const table of coffeeTables) {
    let pose: PlacedItem | null = null;
    if (sofaPlacement) {
      const [fx, fz] = forwardXZ(sofaPlacement.rotationY);
      const dist = sofaPlacement.item.size[2] / 2 + PIECE_GAP + table.size[2] / 2;
      const cx = sofaPlacement.cx + fx * dist;
      const cz = sofaPlacement.cz + fz * dist;
      const rotationY = sofaPlacement.rotationY;
      for (const honor of [true, false]) {
        if (
          canPlace(plan, cx, cz, table.size[0], table.size[2], rotationY, placed, doors, reserved, honor)
        ) {
          pose = {
            item: table,
            cx,
            cz,
            rotationY,
            positionY: 0,
            aabb: rotatedFootprintAabb(cx, cz, table.size[0], table.size[2], rotationY),
            role: 'coffeeTable',
          };
          break;
        }
      }
    }
    pose = pose ?? placeInOpenFloor(plan, table, 'coffeeTable', placed, doors, reserved);
    if (pose) placed.push(pose);
    else skippedIds.push(table.id);
  }

  let diningPlacement: PlacedItem | null = null;
  for (const table of diningTables) {
    const p =
      placeInOpenFloor(plan, table, 'diningTable', placed, doors, reserved) ??
      greedy(table, 'diningTable') ??
      flush(table, 'diningTable');
    if (p) {
      placed.push(p);
      if (!diningPlacement) diningPlacement = p;
    } else skippedIds.push(table.id);
  }

  if (diningPlacement) {
    const table = diningPlacement;
    const still: Item[] = [];
    for (const chair of chairCandidates) {
      let around: PlacedItem | null = null;
      for (const extra of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const yaw = table.rotationY + extra;
        const [fx, fz] = forwardXZ(yaw);
        const alongDepth = Math.abs(Math.cos(extra)) > 0.5;
        const reach =
          (alongDepth ? table.item.size[2] : table.item.size[0]) / 2 + CHAIR_GAP + chair.size[2] / 2;
        const cx = table.cx + fx * reach;
        const cz = table.cz + fz * reach;
        const rotationY = yaw + Math.PI;
        if (!canPlace(plan, cx, cz, chair.size[0], chair.size[2], rotationY, placed, doors, reserved, true)) {
          continue;
        }
        around = {
          item: chair,
          cx,
          cz,
          rotationY,
          positionY: 0,
          aabb: rotatedFootprintAabb(cx, cz, chair.size[0], chair.size[2], rotationY),
          role: 'chair',
        };
        break;
      }
      if (around) placed.push(around);
      else still.push(chair);
    }
    chairCandidates.length = 0;
    chairCandidates.push(...still);
  }
  for (const chair of chairCandidates) {
    const p = greedy(chair, 'chair') ?? flush(chair, 'chair');
    if (p) placed.push(p);
    else skippedIds.push(chair.id);
  }

  const lWalls =
    variant === 2 && bedWall ? uniqueWalls([bedWall, ...neighborWalls(plan, bedWall)]) : [];
  const deskWallAnchor = deskPlacement ? (wallAnchor(walls, deskPlacement)?.seg ?? null) : null;

  const storageOrder = (piece: Item): WallSegment[] => {
    let list = walls;
    if (variant === 0) {
      list = [...walls].sort((a, b) => {
        const oa = occupancy.get(a.wall.id)?.length ?? 0;
        const ob = occupancy.get(b.wall.id)?.length ?? 0;
        return oa - ob || b.length - a.length;
      });
    } else if (variant === 2 && lWalls.length > 0) {
      list = uniqueWalls([...lWalls, ...walls]);
    }
    if (isBookshelfItem(piece) && deskWallAnchor) {
      list = uniqueWalls([deskWallAnchor, ...neighborWalls(plan, deskWallAnchor), ...list]);
    }
    return list;
  };

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

  const floorStorage = storage.filter((piece) => !isStackableStorage(piece));
  const stackable = storage
    .filter(isStackableStorage)
    .sort((a, b) => b.size[0] - a.size[0] || b.size[2] - a.size[2]);

  for (const piece of floorStorage) {
    const order = storageOrder(piece);
    const p =
      greedy(piece, 'storage', order, true) ??
      greedy(piece, 'storage', order, false) ??
      flush(piece, 'storage', order, true) ??
      flush(piece, 'storage', order, false);
    if (p) {
      placed.push(p);
      if (isWardrobeItem(piece)) reserved.push(frontClearZone(p, WARDROBE_SWING));
    } else skippedIds.push(piece.id);
  }

  const ceiling = plan.height;
  const fitsOnColumn = (piece: Item, col: StorageColumn) =>
    col.count < MAX_STACK && piece.size[0] <= col.baseWidth + 2 && col.topY + piece.size[1] <= ceiling;

  for (const piece of stackable) {
    const order = storageOrder(piece);
    if (variant === 2 && lWalls.length > 0) {
      const onL = greedy(piece, 'storage', lWalls, true) ?? greedy(piece, 'storage', lWalls, false);
      if (onL) {
        placed.push(onL);
        rememberColumn(onL);
        continue;
      }
      const column =
        columns.find(
          (col) =>
            fitsOnColumn(piece, col) &&
            !coversWindow(plan, col.seg, col.tAlong - col.baseWidth / 2, col.tAlong + col.baseWidth / 2),
        ) ?? columns.find((col) => fitsOnColumn(piece, col));
      if (column) {
        placed.push(stackOnColumn(piece, 'storage', column));
        column.topY += piece.size[1];
        column.count += 1;
        continue;
      }
    }

    const onClearWall = greedy(piece, 'storage', order, true);
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
    const onAnyWall = clearColumn == null ? greedy(piece, 'storage', order, false) : null;
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
    const forced = flush(piece, 'storage', order, false);
    if (forced) {
      placed.push(forced);
      rememberColumn(forced);
      continue;
    }
    const under = tuckUnderBed(piece, 'storage');
    if (under) placed.push(under);
    else skippedIds.push(piece.id);
  }

  const placeAboveStorage = (item: Item, role: ItemRole): PlacedItem | null => {
    const bases = placed
      .filter((p) => p.role === 'storage' && p.positionY < 1 && !p.tuckedUnderBed)
      .sort((a, b) => a.item.size[1] - b.item.size[1]);
    for (const base of bases) {
      const anchor = wallAnchor(walls, base);
      if (!anchor) continue;
      const y = Math.max(base.positionY + base.item.size[1] + 4, posterBottom(item));
      const pose = elevatedPose(item, role, anchor.seg, anchor.tAlong, y, placed, plan, false);
      if (pose) return pose;
    }
    return scanElevated(plan, item, role, walls, posterBottom(item), placed, true);
  };
  for (const screen of screens) {
    const p = placeAboveStorage(screen, 'screen');
    if (p) placed.push(p);
    else skippedIds.push(screen.id);
  }
  for (const mirror of mirrors) {
    const p = placeAboveStorage(mirror, 'mirror');
    if (p) placed.push(p);
    else skippedIds.push(mirror.id);
  }

  const anchorSeg =
    bedWall ?? (deskPlacement ? (wallAnchor(walls, deskPlacement)?.seg ?? null) : null);
  const anchorPoint = bedPlacement ?? deskPlacement;
  const anchorT =
    anchorSeg && anchorPoint ? tOf(anchorSeg, anchorPoint.cx, anchorPoint.cz) : null;
  const placePosterGroup = () => {
    if (posters.length === 0) return;
    const pending: Item[] = [];
    if (anchorSeg && anchorT != null) {
      const widths = posters.map((poster) => poster.size[0]);
      const total =
        widths.reduce((sum, width) => sum + width, 0) + PIECE_GAP * Math.max(0, posters.length - 1);
      let cursorT = anchorT - total / 2;
      const centers = widths.map((width) => {
        const center = cursorT + width / 2;
        cursorT += width + PIECE_GAP;
        return center;
      });
      const blocked = doorBlockedIntervals(plan, anchorSeg);
      const fits = centers.every((center, index) => {
        const width = widths[index]!;
        const t0 = center - width / 2;
        const t1 = center + width / 2;
        return (
          t0 >= PIECE_GAP &&
          t1 <= anchorSeg.length - PIECE_GAP &&
          !intervalOverlaps(t0, t1, blocked)
        );
      });
      if (fits) {
        for (let i = 0; i < posters.length; i++) {
          const poster = posters[i]!;
          const pose = elevatedPose(
            poster,
            'wallPoster',
            anchorSeg,
            centers[i]!,
            posterBottom(poster),
            placed,
            plan,
            false,
          );
          if (pose) placed.push(pose);
          else pending.push(poster);
        }
      } else {
        const first = posters[0]!;
        const pose =
          elevatedPose(first, 'wallPoster', anchorSeg, anchorT, posterBottom(first), placed, plan, false) ??
          scanElevated(
            plan,
            first,
            'wallPoster',
            uniqueWalls([anchorSeg, ...walls]),
            posterBottom(first),
            placed,
            false,
          );
        if (pose) placed.push(pose);
        else skippedIds.push(first.id);
        pending.push(...posters.slice(1));
      }
    } else {
      pending.push(...posters);
    }
    for (const poster of pending) {
      const pose = scanElevated(
        plan,
        poster,
        'wallPoster',
        anchorSeg ? uniqueWalls([anchorSeg, ...walls]) : walls,
        posterBottom(poster),
        placed,
        true,
      );
      if (pose) placed.push(pose);
      else skippedIds.push(poster.id);
    }
  };
  placePosterGroup();

  for (const plant of plants) {
    const windowWall = wallsWithWindows(plan, walls)[0] ?? null;
    let pose: PlacedItem | null = null;
    const corners = adjacentWallPairs(plan).filter(
      (pair) =>
        !windowWall ||
        pair.segA.wall.id === windowWall.wall.id ||
        pair.segB.wall.id === windowWall.wall.id,
    );
    for (const corner of corners) {
      const seg =
        windowWall && corner.segB.wall.id === windowWall.wall.id ? corner.segB : corner.segA;
      for (const honor of [true, false]) {
        for (const orient of floorOrientations(plant)) {
          const tAlong = tFromCorner(seg, corner.vertex, orient.widthAlong);
          const hit = placeOnWall(
            plan,
            plant,
            'plant',
            seg,
            tAlong,
            orient,
            placed,
            doors,
            occupancy,
            reserved,
            honor,
          );
          if (hit) {
            pose = hit;
            break;
          }
        }
        if (pose) break;
      }
      if (pose) break;
    }
    pose = pose ?? greedy(plant, 'plant') ?? flush(plant, 'plant');
    if (pose) placed.push(pose);
    else skippedIds.push(plant.id);
  }

  for (const piece of leftovers) {
    let pose: PlacedItem | null = null;
    if (prefersWardrobeCorner(piece)) {
      const wardrobe = placed.find((p) => isWardrobeItem(p.item) && p.positionY < 1);
      const pairs = [...adjacentWallPairs(plan)].sort((a, b) => {
        if (!wardrobe) return 0;
        const da = Math.hypot(a.vertex.x - wardrobe.cx, a.vertex.z - wardrobe.cz);
        const db = Math.hypot(b.vertex.x - wardrobe.cx, b.vertex.z - wardrobe.cz);
        return da - db;
      });
      for (const { segA, vertex } of pairs) {
        for (const honor of [true, false]) {
          for (const orient of floorOrientations(piece)) {
            const tAlong = tFromCorner(segA, vertex, orient.widthAlong);
            const hit = placeOnWall(
              plan,
              piece,
              'leftover',
              segA,
              tAlong,
              orient,
              placed,
              doors,
              occupancy,
              reserved,
              honor,
            );
            if (hit) {
              pose = hit;
              break;
            }
          }
          if (pose) break;
        }
        if (pose) break;
      }
    }
    if (!pose) pose = tuckUnderBed(piece, 'leftover');
    if (!pose) pose = greedy(piece, 'leftover') ?? flush(piece, 'leftover');
    if (!pose) pose = tuckUnderBed(piece, 'leftover');
    if (pose) placed.push(pose);
    else skippedIds.push(piece.id);
  }

  const shelfAnchor = anchorSeg;
  for (const shelf of shelves) {
    const y = Math.max(0, Math.min(DEFAULT_SHELF_ELEVATION, plan.height - shelf.size[1]));
    const preferred = uniqueWalls([deskWallAnchor, shelfAnchor, ...walls]);
    let pose: PlacedItem | null = null;
    for (const seg of preferred) {
      const width = shelf.size[0];
      const targets: number[] = [];
      if (deskPlacement && deskWallAnchor?.wall.id === seg.wall.id) {
        const t = tOf(seg, deskPlacement.cx, deskPlacement.cz);
        targets.push(t + deskPlacement.item.size[0] / 2 + PIECE_GAP + width / 2);
        targets.push(t - deskPlacement.item.size[0] / 2 - PIECE_GAP - width / 2);
      }
      if (shelfAnchor?.wall.id === seg.wall.id && anchorT != null) {
        targets.push(anchorT + width / 2 + PIECE_GAP + 18);
        targets.push(anchorT - width / 2 - PIECE_GAP - 18);
      }
      targets.push(seg.length / 2);
      for (const t of targets) {
        const hit = elevatedPose(shelf, 'shelf', seg, t, y, placed, plan, true);
        if (hit) {
          pose = hit;
          break;
        }
      }
      if (pose) break;
    }
    pose = pose ?? scanElevated(plan, shelf, 'shelf', preferred, y, placed, true);
    if (!pose) {
      const base = defaultWallShelfPose(plan, shelf.size);
      const n = placed.filter((p) => p.role === 'shelf').length;
      const rx = Math.cos(base.rotationY);
      const rz = -Math.sin(base.rotationY);
      const cx = base.position[0] + rx * n * (shelf.size[0] + PIECE_GAP);
      const cz = base.position[2] + rz * n * (shelf.size[0] + PIECE_GAP);
      pose = {
        item: shelf,
        cx,
        cz,
        rotationY: base.rotationY,
        positionY: base.position[1],
        aabb: rotatedFootprintAabb(cx, cz, shelf.size[0], shelf.size[2], base.rotationY),
        role: 'shelf',
      };
    }
    placed.push(pose);
  }

  const placedBeforeRecovery = new Set(placed.map((p) => p.item.id));
  for (const item of items) {
    if (classifyItem(item) === 'skip' || riderIds.has(item.id) || pinnedIds.has(item.id)) continue;
    if (placedBeforeRecovery.has(item.id)) continue;
    const role = classifyItem(item);
    if (
      role === 'wallPoster' ||
      role === 'shelf' ||
      role === 'rug' ||
      role === 'screen' ||
      role === 'mirror' ||
      role === 'skip'
    ) {
      continue;
    }
    const p = tuckUnderBed(item, role) ?? greedy(item, role) ?? flush(item, role);
    if (p) {
      placed.push(p);
      const idx = skippedIds.indexOf(item.id);
      if (idx >= 0) skippedIds.splice(idx, 1);
    }
  }

  placeSurfaceRiders(riders, placed);

  const usedLampHosts = new Set<string>();
  const floorHosts = placed.filter(
    (p) => p.role !== 'lamp' && p.role !== 'wallPoster' && p.role !== 'screen' && p.role !== 'mirror',
  );
  for (const lamp of lamps) {
    const host = findLampHost(floorHosts, usedLampHosts);
    if (!host) {
      skippedIds.push(lamp.id);
      continue;
    }
    usedLampHosts.add(`${host.cx},${host.cz}`);
    placed.push(placeLampOnHost(lamp, host, placed));
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
