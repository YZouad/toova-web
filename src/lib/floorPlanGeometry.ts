/**
 * Versioned floor-plan geometry: closed wall loop with openings.
 * Coordinates are inches in top-down XZ (x = east, z = south).
 */

import { DOOR, ROOM, WINDOW } from '../units';

export const FLOOR_PLAN_VERSION = 2 as const;
export const GRID_SNAP_IN = 6;
export const GRID_MAJOR_IN = 12;
export const MIN_WALL_LENGTH = GRID_SNAP_IN;
export const MIN_ROOM_AREA = 60 * 60;
/** Smaller threshold for rendering floor meshes (closets / alcoves). */
export const MIN_FLOOR_FACE_AREA = 30 * 30;
export const OPENING_END_CLEARANCE = 6;
export const MIN_WINDOW_WIDTH = GRID_SNAP_IN;
export const EDITOR_CANVAS_WIDTH = ROOM.width;
export const EDITOR_CANVAS_DEPTH = ROOM.depth;
export const EDITOR_CANVAS_PAD = 24;
export const EDITOR_VERTEX_RADIUS = 1.5;

export interface FloorPlanVertex {
  id: string;
  x: number;
  z: number;
}

export interface FloorPlanWall {
  id: string;
  startId: string;
  endId: string;
}

export type OpeningKind = 'door' | 'window';
export type DoorHinge = 'left' | 'right';

export interface FloorPlanOpening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Distance from wall start vertex along the wall (inches). */
  offset: number;
  width: number;
  height: number;
  /** Sill height from floor (windows only). */
  sill?: number;
  hinge?: DoorHinge;
}

export interface FloorPlan {
  version: typeof FLOOR_PLAN_VERSION;
  height: number;
  vertices: FloorPlanVertex[];
  walls: FloorPlanWall[];
  openings: FloorPlanOpening[];
}

export interface FloorPlanBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
}

export interface WallSegment {
  wall: FloorPlanWall;
  start: FloorPlanVertex;
  end: FloorPlanVertex;
  length: number;
  /** Unit tangent along wall (start → end). */
  tangent: [number, number];
  /** Outward normal (into room interior for CCW winding). */
  outward: [number, number];
  /** Inner-face bottom-center in world space. */
  innerFaceCenter: [number, number, number];
  rotationY: number;
}

export interface ValidationIssue {
  code: string;
  message: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

let nextId = 1;
export function genId(prefix: string): string {
  return `${prefix}-${nextId++}`;
}

export function bumpIdFromPlan(plan: FloorPlan) {
  for (const v of plan.vertices) {
    const m = /-(\d+)$/.exec(v.id);
    if (m) nextId = Math.max(nextId, Number(m[1]) + 1);
  }
  for (const w of plan.walls) {
    const m = /-(\d+)$/.exec(w.id);
    if (m) nextId = Math.max(nextId, Number(m[1]) + 1);
  }
  for (const o of plan.openings) {
    const m = /-(\d+)$/.exec(o.id);
    if (m) nextId = Math.max(nextId, Number(m[1]) + 1);
  }
}

export function snapToGrid(value: number, grid = GRID_SNAP_IN): number {
  return Math.round(value / grid) * grid;
}

export function snapPoint(x: number, z: number, grid = GRID_SNAP_IN): [number, number] {
  return [snapToGrid(x, grid), snapToGrid(z, grid)];
}

/** Snap a point to 45° angles from an anchor when enabled. */
export function snapAngle(
  anchor: [number, number],
  x: number,
  z: number,
  enabled: boolean,
  grid = GRID_SNAP_IN,
): [number, number] {
  if (!enabled) return snapPoint(x, z, grid);
  const dx = x - anchor[0];
  const dz = z - anchor[1];
  const len = Math.hypot(dx, dz);
  if (len < grid) return snapPoint(anchor[0], anchor[1], grid);
  const angle = Math.atan2(dz, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  const sx = anchor[0] + Math.cos(snapped) * len;
  const sz = anchor[1] + Math.sin(snapped) * len;
  return snapPoint(sx, sz, grid);
}

export type LengthUnit = 'inches' | 'ft-in';

export function formatLength(inches: number, unit: LengthUnit): string {
  const rounded = Math.round(inches);
  if (unit === 'inches') return `${rounded}″`;
  const ft = Math.floor(rounded / 12);
  const rem = rounded % 12;
  if (rem === 0) return `${ft}′`;
  return `${ft}′ ${rem}″`;
}

export function rectanglePlan(
  width: number,
  depth: number,
  height: number = ROOM.height,
  withDefaults = true,
): FloorPlan {
  const W = snapToGrid(Math.max(MIN_WALL_LENGTH * 2, width));
  const D = snapToGrid(Math.max(MIN_WALL_LENGTH * 2, depth));
  const v0 = { id: genId('v'), x: 0, z: 0 };
  const v1 = { id: genId('v'), x: W, z: 0 };
  const v2 = { id: genId('v'), x: W, z: D };
  const v3 = { id: genId('v'), x: 0, z: D };
  const w0 = { id: genId('w'), startId: v0.id, endId: v1.id };
  const w1 = { id: genId('w'), startId: v1.id, endId: v2.id };
  const w2 = { id: genId('w'), startId: v2.id, endId: v3.id };
  const w3 = { id: genId('w'), startId: v3.id, endId: v0.id };
  const openings: FloorPlanOpening[] = withDefaults
    ? [
        {
          id: genId('o'),
          wallId: w0.id,
          kind: 'door',
          offset: W / 2 - DOOR.width / 2,
          width: DOOR.width,
          height: DOOR.height,
          hinge: 'left',
        },
        {
          id: genId('o'),
          wallId: w2.id,
          kind: 'window',
          offset: W / 2 - GRID_SNAP_IN / 2,
          width: GRID_SNAP_IN,
          height: WINDOW.height,
          sill: WINDOW.sill,
        },
      ]
    : [];
  return {
    version: FLOOR_PLAN_VERSION,
    height,
    vertices: [v0, v1, v2, v3],
    walls: [w0, w1, w2, w3],
    openings,
  };
}

/** L-shaped room with a rectangular notch cut from the top-right corner. */
export function lShapePlan(
  outerW = 120,
  outerD = 120,
  cutW = 48,
  cutD = 48,
  height: number = ROOM.height,
): FloorPlan {
  const W = snapToGrid(Math.max(MIN_WALL_LENGTH * 3, outerW));
  const D = snapToGrid(Math.max(MIN_WALL_LENGTH * 3, outerD));
  const cW = snapToGrid(Math.min(W - MIN_WALL_LENGTH * 2, Math.max(MIN_WALL_LENGTH, cutW)));
  const cD = snapToGrid(Math.min(D - MIN_WALL_LENGTH * 2, Math.max(MIN_WALL_LENGTH, cutD)));
  const v0 = { id: genId('v'), x: 0, z: 0 };
  const v1 = { id: genId('v'), x: W, z: 0 };
  const v2 = { id: genId('v'), x: W, z: cD };
  const v3 = { id: genId('v'), x: W - cW, z: cD };
  const v4 = { id: genId('v'), x: W - cW, z: D };
  const v5 = { id: genId('v'), x: 0, z: D };
  const w0 = { id: genId('w'), startId: v0.id, endId: v1.id };
  const w1 = { id: genId('w'), startId: v1.id, endId: v2.id };
  const w2 = { id: genId('w'), startId: v2.id, endId: v3.id };
  const w3 = { id: genId('w'), startId: v3.id, endId: v4.id };
  const w4 = { id: genId('w'), startId: v4.id, endId: v5.id };
  const w5 = { id: genId('w'), startId: v5.id, endId: v0.id };
  return {
    version: FLOOR_PLAN_VERSION,
    height,
    vertices: [v0, v1, v2, v3, v4, v5],
    walls: [w0, w1, w2, w3, w4, w5],
    openings: [
      {
        id: genId('o'),
        wallId: w0.id,
        kind: 'door',
        offset: W / 2 - DOOR.width / 2,
        width: DOOR.width,
        height: DOOR.height,
        hinge: 'left',
      },
    ],
  };
}

export function defaultRectanglePlan(): FloorPlan {
  return rectanglePlan(ROOM.width, ROOM.depth, ROOM.height);
}

export function setWallLength(plan: FloorPlan, wallId: string, length: number): FloorPlan {
  const wall = wallById(plan, wallId);
  if (!wall) return plan;
  const seg = getWallSegment(plan, wall);
  if (!seg) return plan;
  const clampedLen = Math.max(MIN_WALL_LENGTH, length);
  const [tx, tz] = seg.tangent;
  const newEndX = seg.start.x + tx * clampedLen;
  const newEndZ = seg.start.z + tz * clampedLen;
  const [sx, sz] = snapPoint(newEndX, newEndZ);
  const vertices = plan.vertices.map((v) =>
    v.id === wall.endId ? { ...v, x: sx, z: sz } : v,
  );
  return { ...plan, vertices };
}

export function moveVertex(
  plan: FloorPlan,
  vertexId: string,
  x: number,
  z: number,
  grid = GRID_SNAP_IN,
): FloorPlan {
  const [sx, sz] = snapPoint(x, z, grid);
  const vertices = plan.vertices.map((v) =>
    v.id === vertexId ? { ...v, x: sx, z: sz } : v,
  );
  return { ...plan, vertices };
}

export function updateOpening(
  plan: FloorPlan,
  openingId: string,
  patch: Partial<Pick<FloorPlanOpening, 'offset' | 'width' | 'height' | 'sill' | 'hinge'>>,
): FloorPlan {
  const openings = plan.openings.map((o) =>
    o.id === openingId ? { ...o, ...patch } : o,
  );
  return clampPlan({ ...plan, openings });
}

export function emptyPlan(height = ROOM.height): FloorPlan {
  return {
    version: FLOOR_PLAN_VERSION,
    height,
    vertices: [],
    walls: [],
    openings: [],
  };
}

export function vertexById(plan: FloorPlan, id: string): FloorPlanVertex | undefined {
  return plan.vertices.find((v) => v.id === id);
}

export function wallById(plan: FloorPlan, id: string): FloorPlanWall | undefined {
  return plan.walls.find((w) => w.id === id);
}

export function planBounds(plan: FloorPlan): FloorPlanBounds {
  if (plan.vertices.length === 0) {
    return editorCanvasBounds();
  }
  const xs = plan.vertices.map((v) => v.x);
  const zs = plan.vertices.map((v) => v.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

/** Fixed drawing area for the 2D editor — does not shrink with partial plans. */
export function editorCanvasBounds(): FloorPlanBounds {
  return {
    minX: 0,
    maxX: EDITOR_CANVAS_WIDTH,
    minZ: 0,
    maxZ: EDITOR_CANVAS_DEPTH,
    width: EDITOR_CANVAS_WIDTH,
    depth: EDITOR_CANVAS_DEPTH,
  };
}

export function planCentroid(plan: FloorPlan): [number, number] {
  const b = planBounds(plan);
  return [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2];
}

/** Signed area — positive when CCW in XZ. */
export function signedArea(plan: FloorPlan): number {
  const verts = orderedVertices(plan);
  if (verts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % verts.length]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

/** Walk vertices around the outer room boundary (supports interior partition walls). */
export function orderedVertices(plan: FloorPlan): FloorPlanVertex[] {
  if (plan.walls.length === 0) return [...plan.vertices];
  const outer = outerFaceVertices(plan);
  if (outer.length >= 3) return outer;
  return walkSingleLoopVertices(plan);
}

export function wallLength(plan: FloorPlan, wall: FloorPlanWall): number {
  const a = vertexById(plan, wall.startId);
  const b = vertexById(plan, wall.endId);
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  const qx = ax + t * dx;
  const qz = az + t * dz;
  return Math.hypot(px - qx, pz - qz);
}

export function offsetOnWall(plan: FloorPlan, wall: FloorPlanWall, x: number, z: number): number {
  const seg = getWallSegment(plan, wall);
  if (!seg) return 0;
  const dx = seg.end.x - seg.start.x;
  const dz = seg.end.z - seg.start.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return 0;
  const t = ((x - seg.start.x) * dx + (z - seg.start.z) * dz) / len2;
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * Math.sqrt(len2);
}

export function hitWallAtPoint(
  plan: FloorPlan,
  x: number,
  z: number,
  threshold = 8,
): FloorPlanWall | null {
  let best: FloorPlanWall | null = null;
  let bestDist = threshold;
  for (const w of plan.walls) {
    const seg = getWallSegment(plan, w);
    if (!seg) continue;
    const d = distToSegment(x, z, seg.start.x, seg.start.z, seg.end.x, seg.end.z);
    if (d < bestDist) {
      bestDist = d;
      best = w;
    }
  }
  return best;
}

/** Split a wall at an interior point so T-junctions connect to both sides. */
export function splitWallAtVertex(
  plan: FloorPlan,
  wall: FloorPlanWall,
  x: number,
  z: number,
  vertexId: string,
): FloorPlan {
  const [sx, sz] = snapPoint(x, z);
  const len = wallLength(plan, wall);
  const offset = offsetOnWall(plan, wall, sx, sz);
  const w1Id = genId('w');
  const w2Id = genId('w');

  const walls = plan.walls
    .filter((w) => w.id !== wall.id)
    .concat([
      { id: w1Id, startId: wall.startId, endId: vertexId },
      { id: w2Id, startId: vertexId, endId: wall.endId },
    ]);

  const openings = plan.openings.map((o) => {
    if (o.wallId !== wall.id) return o;
    const mid = o.offset + o.width / 2;
    if (mid <= offset) {
      return { ...o, wallId: w1Id };
    }
    return { ...o, wallId: w2Id, offset: o.offset - offset };
  });

  const vertices = plan.vertices.some((v) => v.id === vertexId)
    ? plan.vertices
    : [...plan.vertices, { id: vertexId, x: sx, z: sz }];

  return { ...plan, vertices, walls, openings };
}

export type WallAnchorResolution =
  | { kind: 'existing'; plan: FloorPlan; vertexId: string }
  | { kind: 'split'; plan: FloorPlan; vertexId: string }
  | { kind: 'pending'; vertexId: string; x: number; z: number };

/** Resolve a click to an existing corner, a wall T-junction (splitting if needed), or a free pending point. */
export function resolveWallAnchor(
  plan: FloorPlan,
  x: number,
  z: number,
  vertexId = genId('v'),
): WallAnchorResolution {
  const [sx, sz] = snapPoint(x, z);
  const existing = plan.vertices.find((v) => Math.hypot(v.x - sx, v.z - sz) < GRID_SNAP_IN);
  if (existing) {
    return { kind: 'existing', plan, vertexId: existing.id };
  }

  const wall = hitWallAtPoint(plan, sx, sz);
  if (wall) {
    const len = wallLength(plan, wall);
    const offset = offsetOnWall(plan, wall, sx, sz);
    if (offset <= MIN_WALL_LENGTH) {
      return { kind: 'existing', plan, vertexId: wall.startId };
    }
    if (len - offset <= MIN_WALL_LENGTH) {
      return { kind: 'existing', plan, vertexId: wall.endId };
    }
    return {
      kind: 'split',
      plan: splitWallAtVertex(plan, wall, sx, sz, vertexId),
      vertexId,
    };
  }

  return { kind: 'pending', vertexId, x: sx, z: sz };
}

export function getWallSegment(plan: FloorPlan, wall: FloorPlanWall): WallSegment | null {
  const start = vertexById(plan, wall.startId);
  const end = vertexById(plan, wall.endId);
  if (!start || !end) return null;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return null;
  const tx = dx / length;
  const tz = dz / length;
  const [cx, cz] = planCentroid(plan);
  const midX = (start.x + end.x) / 2;
  const midZ = (start.z + end.z) / 2;
  const n1: [number, number] = [tz, -tx];
  const n2: [number, number] = [-tz, tx];
  const toCentroidX = cx - midX;
  const toCentroidZ = cz - midZ;
  const interior =
    n1[0] * toCentroidX + n1[1] * toCentroidZ >= n2[0] * toCentroidX + n2[1] * toCentroidZ ? n1 : n2;
  const outward: [number, number] = [-interior[0], -interior[1]];
  const inset = ROOM.wallThickness / 2;
  const innerFaceCenter: [number, number, number] = [
    midX + interior[0] * inset,
    0,
    midZ + interior[1] * inset,
  ];
  const rotationY = Math.atan2(outward[0], outward[1]);
  return {
    wall,
    start,
    end,
    length,
    tangent: [tx, tz],
    outward,
    innerFaceCenter,
    rotationY,
  };
}

export function allWallSegments(plan: FloorPlan): WallSegment[] {
  return plan.walls
    .map((w) => getWallSegment(plan, w))
    .filter((s): s is WallSegment => s != null);
}

/** Normalize plan so min corner is at origin. */
export function normalizePlanOrigin(plan: FloorPlan): FloorPlan {
  const b = planBounds(plan);
  if (b.minX === 0 && b.minZ === 0) return plan;
  return {
    ...plan,
    vertices: plan.vertices.map((v) => ({
      ...v,
      x: v.x - b.minX,
      z: v.z - b.minZ,
    })),
  };
}

export function clampPlanHeight(height: number): number {
  return clamp(height, 72, 144);
}

export function clampPlan(plan: FloorPlan): FloorPlan {
  const height = clampPlanHeight(plan.height);
  const openings = plan.openings.map((o) => {
    const wall = wallById(plan, o.wallId);
    const len = wall ? wallLength(plan, wall) : o.width;
    const maxW = Math.max(MIN_WINDOW_WIDTH, len - 2 * OPENING_END_CLEARANCE);
    const minW = o.kind === 'window' ? MIN_WINDOW_WIDTH : 12;
    const width = clamp(o.width, minW, maxW);
    const maxOffset = Math.max(0, len - width - OPENING_END_CLEARANCE);
    const offset = clamp(o.offset, OPENING_END_CLEARANCE, maxOffset);
    if (o.kind === 'window') {
      const sill = clamp(o.sill ?? 36, 0, height - 12);
      const h = clamp(o.height, 12, height - sill);
      return { ...o, width, offset, sill, height: h };
    }
    const h = clamp(o.height, 12, height);
    return { ...o, width, offset, height: h };
  });
  return { ...plan, height, openings };
}

export function removeWall(plan: FloorPlan, wallId: string): FloorPlan {
  const walls = plan.walls.filter((w) => w.id !== wallId);
  const openings = plan.openings.filter((o) => o.wallId !== wallId);
  const usedVerts = new Set<string>();
  for (const w of walls) {
    usedVerts.add(w.startId);
    usedVerts.add(w.endId);
  }
  const vertices = plan.vertices.filter((v) => usedVerts.has(v.id));
  return { ...plan, walls, openings, vertices };
}

export function removeOpening(plan: FloorPlan, openingId: string): FloorPlan {
  return { ...plan, openings: plan.openings.filter((o) => o.id !== openingId) };
}

/** Vertices with fewer than two connected walls (open ends and orphans). */
export function openEndpointVertexIds(plan: FloorPlan): string[] {
  const degree = vertexDegrees(plan);
  return plan.vertices
    .filter((v) => (degree.get(v.id) ?? 0) < 2)
    .map((v) => v.id);
}

function distPointToLine(
  px: number,
  pz: number,
  ax: number,
  az: number,
  tx: number,
  tz: number,
): number {
  return Math.abs(-tz * (px - ax) + tx * (pz - az));
}

function areWallsOnSameLine(plan: FloorPlan, wa: FloorPlanWall, wb: FloorPlanWall): boolean {
  const sa = getWallSegment(plan, wa);
  const sb = getWallSegment(plan, wb);
  if (!sa || !sb) return false;
  const cross = sa.tangent[0] * sb.tangent[1] - sa.tangent[1] * sb.tangent[0];
  if (Math.abs(cross) > 0.05) return false;
  return (
    distPointToLine(sb.start.x, sb.start.z, sa.start.x, sa.start.z, sa.tangent[0], sa.tangent[1]) <
    0.5
  );
}

function wallTRange(
  plan: FloorPlan,
  wall: FloorPlanWall,
  origin: FloorPlanVertex,
  tx: number,
  tz: number,
): [number, number] {
  const a = vertexById(plan, wall.startId);
  const b = vertexById(plan, wall.endId);
  if (!a || !b) return [0, 0];
  const ta = (a.x - origin.x) * tx + (a.z - origin.z) * tz;
  const tb = (b.x - origin.x) * tx + (b.z - origin.z) * tz;
  return [Math.min(ta, tb), Math.max(ta, tb)];
}

function intervalsOverlapInterior(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] - 0.5 && b[0] < a[1] - 0.5;
}

function openingCenter(plan: FloorPlan, opening: FloorPlanOpening): [number, number] | null {
  const wall = wallById(plan, opening.wallId);
  if (!wall) return null;
  const seg = getWallSegment(plan, wall);
  if (!seg) return null;
  return [
    seg.start.x + seg.tangent[0] * (opening.offset + opening.width / 2),
    seg.start.z + seg.tangent[1] * (opening.offset + opening.width / 2),
  ];
}

function findWallContainingPoint(plan: FloorPlan, x: number, z: number): FloorPlanWall | null {
  for (const w of plan.walls) {
    const seg = getWallSegment(plan, w);
    if (!seg) continue;
    const t = (x - seg.start.x) * seg.tangent[0] + (z - seg.start.z) * seg.tangent[1];
    if (t < -0.5 || t > seg.length + 0.5) continue;
    const dist = distPointToLine(x, z, seg.start.x, seg.start.z, seg.tangent[0], seg.tangent[1]);
    if (dist < ROOM.wallThickness + 1) return w;
  }
  return hitWallAtPoint(plan, x, z, 12);
}

function remapOpeningToWall(plan: FloorPlan, opening: FloorPlanOpening, center: [number, number]): FloorPlanOpening {
  const [cx, cz] = center;
  const target = findWallContainingPoint(plan, cx, cz);
  if (!target) return opening;
  const seg = getWallSegment(plan, target);
  if (!seg) return opening;
  const along = (cx - seg.start.x) * seg.tangent[0] + (cz - seg.start.z) * seg.tangent[1];
  const maxOffset = Math.max(0, seg.length - opening.width - OPENING_END_CLEARANCE);
  const offset = clamp(along - opening.width / 2, OPENING_END_CLEARANCE, maxOffset);
  return { ...opening, wallId: target.id, offset };
}

function decomposeCollinearWallChain(
  plan: FloorPlan,
  chain: FloorPlanWall[],
  frame: WallSegment,
): FloorPlan {
  const [tx, tz] = frame.tangent;
  const origin = frame.start;
  const chainIds = new Set(chain.map((w) => w.id));

  const breakpoints = new Set<number>();
  for (const wall of chain) {
    const [t0, t1] = wallTRange(plan, wall, origin, tx, tz);
    breakpoints.add(t0);
    breakpoints.add(t1);
  }
  const sorted = [...breakpoints].sort((a, b) => a - b);

  const pointAt = (t: number) => snapPoint(origin.x + tx * t, origin.z + tz * t);

  let vertices = [...plan.vertices];
  const vertexAt = (t: number): string => {
    const [sx, sz] = pointAt(t);
    const match = vertices.find((v) => Math.hypot(v.x - sx, v.z - sz) < 0.5);
    if (match) return match.id;
    const id = genId('v');
    vertices = [...vertices, { id, x: sx, z: sz }];
    return id;
  };

  const covers = (t0: number, t1: number): boolean =>
    chain.some((wall) => {
      const [a, b] = wallTRange(plan, wall, origin, tx, tz);
      return a <= t0 + 0.5 && b >= t1 - 0.5;
    });

  const newWalls: FloorPlanWall[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const t0 = sorted[i]!;
    const t1 = sorted[i + 1]!;
    if (t1 - t0 < MIN_WALL_LENGTH - 0.5) continue;
    if (!covers(t0, t1)) continue;
    const startId = vertexAt(t0);
    const endId = vertexAt(t1);
    if (startId === endId) continue;
    newWalls.push({ id: genId('w'), startId, endId });
  }

  const walls = plan.walls.filter((w) => !chainIds.has(w.id)).concat(newWalls);
  const openingCenters = plan.openings.map((o) => ({ o, center: openingCenter(plan, o) }));
  const openings = openingCenters.map(({ o, center }) =>
    center ? remapOpeningToWall({ ...plan, vertices, walls }, o, center) : o,
  );

  return { ...plan, vertices, walls, openings };
}

/** Split overlapping collinear walls so doors/windows only cut one segment. */
export function resolveCollinearOverlaps(plan: FloorPlan): FloorPlan {
  let result = plan;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < result.walls.length; i++) {
      for (let j = i + 1; j < result.walls.length; j++) {
        const w1 = result.walls[i]!;
        const w2 = result.walls[j]!;
        if (!areWallsOnSameLine(result, w1, w2)) continue;
        const chain = result.walls.filter((w) => areWallsOnSameLine(result, w1, w));
        const frame = getWallSegment(result, w1);
        if (!frame) continue;
        const [tx, tz] = frame.tangent;
        const origin = frame.start;
        const ranges = chain.map((w) => wallTRange(result, w, origin, tx, tz));
        const hasOverlap = ranges.some((a, ai) =>
          ranges.some((b, bi) => ai !== bi && intervalsOverlapInterior(a, b)),
        );
        if (!hasOverlap) continue;
        result = decomposeCollinearWallChain(result, chain, frame);
        changed = true;
        break outer;
      }
    }
  }
  return result;
}

function projectsOpeningOntoSegment(
  plan: FloorPlan,
  opening: FloorPlanOpening,
  segment: WallSegment,
): boolean {
  const center = openingCenter(plan, opening);
  if (!center) return opening.wallId === segment.wall.id;
  const [cx, cz] = center;
  const t = (cx - segment.start.x) * segment.tangent[0] + (cz - segment.start.z) * segment.tangent[1];
  const half = opening.width / 2;
  if (t + half < 0.5 || t - half > segment.length - 0.5) return false;
  const dist = distPointToLine(
    cx,
    cz,
    segment.start.x,
    segment.start.z,
    segment.tangent[0],
    segment.tangent[1],
  );
  if (dist > ROOM.wallThickness + 1) return opening.wallId === segment.wall.id;
  return true;
}

/** Merge corners that land on the same grid point and drop unused vertices. */
export function sanitizeWallGraph(plan: FloorPlan): FloorPlan {
  const remap = new Map<string, string>();
  const kept: FloorPlanVertex[] = [];

  for (const v of plan.vertices) {
    const snapX = snapToGrid(v.x);
    const snapZ = snapToGrid(v.z);
    const match = kept.find(
      (k) => Math.abs(k.x - snapX) < 0.5 && Math.abs(k.z - snapZ) < 0.5,
    );
    if (match) {
      remap.set(v.id, match.id);
    } else {
      const merged = { ...v, x: snapX, z: snapZ };
      kept.push(merged);
      remap.set(v.id, merged.id);
    }
  }

  let walls = plan.walls.map((w) => ({
    ...w,
    startId: remap.get(w.startId) ?? w.startId,
    endId: remap.get(w.endId) ?? w.endId,
  }));
  walls = walls.filter((w) => w.startId !== w.endId);

  const keptWallByKey = new Map<string, string>();
  const wallIdRemap = new Map<string, string>();
  walls = walls.filter((w) => {
    const key = [w.startId, w.endId].sort().join('|');
    const keptId = keptWallByKey.get(key);
    if (keptId) {
      wallIdRemap.set(w.id, keptId);
      return false;
    }
    keptWallByKey.set(key, w.id);
    return true;
  });

  let openings = plan.openings.map((o) =>
    wallIdRemap.has(o.wallId) ? { ...o, wallId: wallIdRemap.get(o.wallId)! } : o,
  );

  let next: FloorPlan = { ...plan, vertices: kept, walls, openings };
  next = resolveCollinearOverlaps(next);

  const degree = new Map<string, number>();
  for (const w of next.walls) {
    degree.set(w.startId, (degree.get(w.startId) ?? 0) + 1);
    degree.set(w.endId, (degree.get(w.endId) ?? 0) + 1);
  }
  const vertices = next.vertices.filter((v) => (degree.get(v.id) ?? 0) > 0);

  return { ...next, vertices };
}

function segmentsIntersect(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
  excludeSharedEndpoint = false,
): boolean {
  const cross = (p: [number, number], q: [number, number], r: [number, number]) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = cross(a1, a2, b1);
  const d2 = cross(a1, a2, b2);
  const d3 = cross(b1, b2, a1);
  const d4 = cross(b1, b2, a2);
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  if (excludeSharedEndpoint) {
    const same = (p: [number, number], q: [number, number]) =>
      Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5;
    if (same(a1, b1) || same(a1, b2) || same(a2, b1) || same(a2, b2)) return false;
  }
  return false;
}

export function hasSelfIntersection(plan: FloorPlan): boolean {
  const segs = plan.walls
    .map((w) => {
      const a = vertexById(plan, w.startId);
      const b = vertexById(plan, w.endId);
      if (!a || !b) return null;
      return { a: [a.x, a.z] as [number, number], b: [b.x, b.z] as [number, number] };
    })
    .filter((s): s is { a: [number, number]; b: [number, number] } => s != null);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const adjacent =
        Math.hypot(segs[i]!.a[0] - segs[j]!.b[0], segs[i]!.a[1] - segs[j]!.b[1]) < 0.5 ||
        Math.hypot(segs[i]!.b[0] - segs[j]!.a[0], segs[i]!.b[1] - segs[j]!.a[1]) < 0.5;
      if (adjacent) continue;
      if (segmentsIntersect(segs[i]!.a, segs[i]!.b, segs[j]!.a, segs[j]!.b, true)) {
        return true;
      }
    }
  }
  return false;
}

interface HalfEdge {
  id: number;
  fromId: string;
  toId: string;
  angle: number;
  next?: HalfEdge;
  twin?: HalfEdge;
}

function vertexDegrees(plan: FloorPlan): Map<string, number> {
  const degree = new Map<string, number>();
  for (const w of plan.walls) {
    degree.set(w.startId, (degree.get(w.startId) ?? 0) + 1);
    degree.set(w.endId, (degree.get(w.endId) ?? 0) + 1);
  }
  return degree;
}

function polygonAreaVerts(verts: FloorPlanVertex[]): number {
  if (verts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % verts.length]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

function buildHalfEdges(plan: FloorPlan): HalfEdge[] {
  const edges: HalfEdge[] = [];
  let id = 0;
  for (const w of plan.walls) {
    const a = vertexById(plan, w.startId);
    const b = vertexById(plan, w.endId);
    if (!a || !b) continue;
    const e1: HalfEdge = {
      id: id++,
      fromId: w.startId,
      toId: w.endId,
      angle: Math.atan2(b.z - a.z, b.x - a.x),
    };
    const e2: HalfEdge = {
      id: id++,
      fromId: w.endId,
      toId: w.startId,
      angle: Math.atan2(a.z - b.z, a.x - b.x),
    };
    e1.twin = e2;
    e2.twin = e1;
    edges.push(e1, e2);
  }

  const outgoing = new Map<string, HalfEdge[]>();
  for (const e of edges) {
    const list = outgoing.get(e.fromId) ?? [];
    list.push(e);
    outgoing.set(e.fromId, list);
  }
  for (const list of outgoing.values()) {
    list.sort((a, b) => a.angle - b.angle);
  }

  for (const e of edges) {
    const list = outgoing.get(e.toId);
    if (!list || !e.twin) continue;
    const twinIdx = list.findIndex((he) => he.toId === e.fromId);
    if (twinIdx < 0) continue;
    const nextIdx = (twinIdx - 1 + list.length) % list.length;
    e.next = list[nextIdx];
  }

  return edges;
}

function extractFaces(plan: FloorPlan): FloorPlanVertex[][] {
  const halfEdges = buildHalfEdges(plan);
  const visited = new Set<number>();
  const faces: FloorPlanVertex[][] = [];

  for (const start of halfEdges) {
    if (visited.has(start.id) || !start.next) continue;
    const ids: string[] = [];
    let current: HalfEdge | undefined = start;
    do {
      visited.add(current.id);
      ids.push(current.fromId);
      current = current.next;
    } while (current && current.id !== start.id);

    if (ids.length < 3) continue;
    const verts = ids
      .map((id) => vertexById(plan, id))
      .filter((v): v is FloorPlanVertex => v != null);
    if (verts.length >= 3) faces.push(verts);
  }

  return faces;
}

/** Largest face by area — the outer room envelope, even with interior partition walls. */
export function outerFaceVertices(plan: FloorPlan): FloorPlanVertex[] {
  const faces = extractFaces(plan);
  if (faces.length === 0) return walkSingleLoopVertices(plan);

  let best = faces[0]!;
  let bestArea = Math.abs(polygonAreaVerts(best));
  for (const face of faces.slice(1)) {
    const area = Math.abs(polygonAreaVerts(face));
    if (area > bestArea) {
      bestArea = area;
      best = face;
    }
  }
  return best;
}

function ensureCCW(verts: FloorPlanVertex[]): FloorPlanVertex[] {
  return polygonAreaVerts(verts) < 0 ? [...verts].reverse() : verts;
}

/** All enclosed floor polygons (main room + interior sub-rooms). */
export function floorFaceLoops(plan: FloorPlan): FloorPlanVertex[][] {
  const faces = extractFaces(plan);
  const qualified = faces
    .map((verts) => ({ verts, area: polygonAreaVerts(verts) }))
    .filter(({ area }) => Math.abs(area) >= MIN_FLOOR_FACE_AREA);

  if (qualified.length === 0) {
    const outer = outerFaceVertices(plan);
    if (outer.length >= 3 && Math.abs(polygonAreaVerts(outer)) >= MIN_FLOOR_FACE_AREA) {
      return [ensureCCW(outer)];
    }
    return [];
  }

  if (qualified.length === 1) {
    return [ensureCCW(qualified[0]!.verts)];
  }

  // Drop the unbounded exterior face (largest absolute area).
  let maxIdx = 0;
  let maxAbs = Math.abs(qualified[0]!.area);
  for (let i = 1; i < qualified.length; i++) {
    const abs = Math.abs(qualified[i]!.area);
    if (abs > maxAbs) {
      maxAbs = abs;
      maxIdx = i;
    }
  }

  const seen = new Set<string>();
  const loops: FloorPlanVertex[][] = [];
  for (let i = 0; i < qualified.length; i++) {
    if (i === maxIdx) continue;
    const verts = ensureCCW(qualified[i]!.verts);
    const key = verts
      .map((v) => `${snapToGrid(v.x)},${snapToGrid(v.z)}`)
      .sort()
      .join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    loops.push(verts);
  }

  return loops;
}

function walkSingleLoopVertices(plan: FloorPlan): FloorPlanVertex[] {
  if (plan.walls.length === 0) return [...plan.vertices];
  const out: FloorPlanVertex[] = [];
  const first = plan.walls[0]!;
  const start = vertexById(plan, first.startId);
  if (!start) return [...plan.vertices];
  out.push(start);
  let currentId = first.endId;
  const used = new Set<string>([first.id]);
  for (let step = 0; step < plan.walls.length; step++) {
    const v = vertexById(plan, currentId);
    if (!v) break;
    out.push(v);
    const nextWall = plan.walls.find(
      (w) => !used.has(w.id) && (w.startId === currentId || w.endId === currentId),
    );
    if (!nextWall) break;
    used.add(nextWall.id);
    currentId = nextWall.startId === currentId ? nextWall.endId : nextWall.startId;
    if (currentId === start.id) break;
  }
  return out;
}

/** True when every wall endpoint connects to at least one other wall. */
export function hasNoDanglingWalls(plan: FloorPlan): boolean {
  if (plan.walls.length < 3) return false;
  return openEndpointVertexIds(plan).length === 0;
}

/** True when the outer envelope forms a large enough enclosed footprint. */
export function hasEnclosedFootprint(plan: FloorPlan): boolean {
  if (!hasNoDanglingWalls(plan)) return false;
  const outer = outerFaceVertices(plan);
  return outer.length >= 3 && Math.abs(polygonAreaVerts(outer)) >= MIN_ROOM_AREA;
}

export function isClosedLoop(plan: FloorPlan): boolean {
  if (plan.walls.length < 3 || plan.vertices.length < 3) return false;
  const degree = new Map<string, number>();
  for (const w of plan.walls) {
    degree.set(w.startId, (degree.get(w.startId) ?? 0) + 1);
    degree.set(w.endId, (degree.get(w.endId) ?? 0) + 1);
  }
  for (const count of degree.values()) {
    if (count !== 2) return false;
  }
  return true;
}

export function openingsOverlap(a: FloorPlanOpening, b: FloorPlanOpening): boolean {
  if (a.wallId !== b.wallId) return false;
  const a0 = a.offset;
  const a1 = a.offset + a.width;
  const b0 = b.offset;
  const b1 = b.offset + b.width;
  return a0 < b1 - 0.5 && a1 > b0 + 0.5;
}

export function validateFloorPlan(plan: FloorPlan): ValidationIssue[] {
  const p = sanitizeWallGraph(plan);
  const issues: ValidationIssue[] = [];
  const open = openEndpointVertexIds(p);
  if (open.length > 0) {
    issues.push({
      code: 'open_ends',
      message:
        open.length === 1
          ? '1 wall endpoint is still open (marked in red).'
          : `${open.length} wall endpoints are still open (marked in red).`,
    });
  } else if (!hasEnclosedFootprint(p)) {
    issues.push({ code: 'no_envelope', message: 'Draw an enclosed outer room boundary.' });
  }
  if (hasSelfIntersection(p)) {
    issues.push({ code: 'self_intersect', message: 'Walls must not cross each other.' });
  }
  const area = Math.abs(polygonAreaVerts(outerFaceVertices(p)));
  if (open.length === 0 && area < MIN_ROOM_AREA) {
    issues.push({ code: 'too_small', message: 'Room footprint is too small.' });
  }
  for (const w of p.walls) {
    const len = wallLength(p, w);
    if (len < MIN_WALL_LENGTH) {
      issues.push({
        code: 'short_wall',
        message: `Each wall must be at least ${MIN_WALL_LENGTH} inches.`,
      });
      break;
    }
  }
  const doors = p.openings.filter((o) => o.kind === 'door');
  if (doors.length < 1) {
    issues.push({ code: 'no_door', message: 'Add at least one door before continuing.' });
  }
  for (const o of p.openings) {
    const wall = wallById(p, o.wallId);
    if (!wall) {
      issues.push({ code: 'orphan_opening', message: 'An opening is on a missing wall.' });
      continue;
    }
    const len = wallLength(p, wall);
    if (o.offset < OPENING_END_CLEARANCE - 0.5 || o.offset + o.width > len - OPENING_END_CLEARANCE + 0.5) {
      issues.push({ code: 'opening_bounds', message: 'An opening is too close to a wall end.' });
    }
  }
  for (let i = 0; i < p.openings.length; i++) {
    for (let j = i + 1; j < p.openings.length; j++) {
      if (openingsOverlap(p.openings[i]!, p.openings[j]!)) {
        issues.push({ code: 'opening_overlap', message: 'Openings on the same wall cannot overlap.' });
        break;
      }
    }
  }
  return issues;
}

export function isValidFloorPlan(plan: FloorPlan): boolean {
  return validateFloorPlan(plan).length === 0;
}

/** Ray-casting point-in-polygon for floor footprint. */
export function pointInPolygon(x: number, z: number, plan: FloorPlan, inset = 1): boolean {
  const verts = orderedVertices(plan);
  if (verts.length < 3) return false;
  const poly = verts.map((v) => ({ x: v.x, z: v.z }));
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x;
    const zi = poly[i]!.z;
    const xj = poly[j]!.x;
    const zj = poly[j]!.z;
    const intersect =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  if (!inside) return false;
  if (inset <= 0) return true;
  return distanceToBoundary(x, z, plan) >= inset;
}

export function distanceToBoundary(x: number, z: number, plan: FloorPlan): number {
  let minDist = Infinity;
  for (const w of plan.walls) {
    const a = vertexById(plan, w.startId);
    const b = vertexById(plan, w.endId);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) continue;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / len2, 0, 1);
    const px = a.x + t * dx;
    const pz = a.z + t * dz;
    minDist = Math.min(minDist, Math.hypot(x - px, z - pz));
  }
  return minDist;
}

export function isTouchingAnyWall(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  plan: FloorPlan,
  tolerance = 6,
): boolean {
  const corners: [number, number][] = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
  for (const [x, z] of corners) {
    if (distanceToBoundary(x, z, plan) <= tolerance) return true;
  }
  return false;
}

/** Holes in wall-local coords for extrusion (x centered on wall, y from floor). */
export function holesForWallSegment(
  plan: FloorPlan,
  segment: WallSegment,
): { x: number; y: number; w: number; h: number }[] {
  const { length, outward, tangent } = segment;
  const [ox, oz] = outward;
  const [tx, tz] = tangent;
  // Wall rotation maps local +X to (oz, -ox). Openings measure offset along +tangent.
  const localXAlongTangent = oz * tx + -ox * tz;

  const openings = plan.openings.filter((o) => projectsOpeningOntoSegment(plan, o, segment));

  return openings.map((o) => {
    const center = openingCenter(plan, o);
    const along =
      center != null
        ? (center[0] - segment.start.x) * tx + (center[1] - segment.start.z) * tz - length / 2
        : o.offset + o.width / 2 - length / 2;
    return {
      x: localXAlongTangent >= 0 ? along : -along,
      y: o.kind === 'window' ? (o.sill ?? 36) : 0,
      w: o.width,
      h: o.height,
    };
  });
}

export interface OpeningWorldPlacement {
  opening: FloorPlanOpening;
  cx: number;
  cy: number;
  cz: number;
  outward: [number, number, number];
  w: number;
  h: number;
  rotationY: number;
}

export function openingWorldPlacement(
  plan: FloorPlan,
  opening: FloorPlanOpening,
): OpeningWorldPlacement | null {
  const wall = wallById(plan, opening.wallId);
  if (!wall) return null;
  const seg = getWallSegment(plan, wall);
  if (!seg) return null;
  const [tx, tz] = seg.tangent;
  const [ox, oz] = seg.outward;
  const interior: [number, number] = [-ox, -oz];
  const baseX = seg.start.x + tx * opening.offset;
  const baseZ = seg.start.z + tz * opening.offset;
  const alongX = baseX + tx * (opening.width / 2);
  const alongZ = baseZ + tz * (opening.width / 2);
  const inset = ROOM.wallThickness / 2;
  const cx = alongX + interior[0] * inset;
  const cz = alongZ + interior[1] * inset;
  const sill = opening.kind === 'window' ? (opening.sill ?? 36) : 0;
  const cy = sill + opening.height / 2;
  // Face into the room: local +X along the wall, local +Z toward interior.
  const rotationY = Math.atan2(interior[0], interior[1]);
  return {
    opening,
    cx,
    cy,
    cz,
    outward: [ox, 0, oz],
    w: opening.width,
    h: opening.height,
    rotationY,
  };
}

export function windowOpenings(plan: FloorPlan): FloorPlanOpening[] {
  return plan.openings.filter((o) => o.kind === 'window');
}

export function doorOpenings(plan: FloorPlan): FloorPlanOpening[] {
  return plan.openings.filter((o) => o.kind === 'door');
}

// --- Legacy v1 adapter ---

export type WallId = 'north' | 'south' | 'east' | 'west';

export interface RoomWindow {
  wall: WallId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LegacyRoomGeometry {
  width: number;
  depth: number;
  height: number;
  windows: RoomWindow[];
}

export function legacyToFloorPlan(legacy: LegacyRoomGeometry): FloorPlan {
  const W = legacy.width;
  const D = legacy.depth;
  const v0 = { id: genId('v'), x: 0, z: 0 };
  const v1 = { id: genId('v'), x: W, z: 0 };
  const v2 = { id: genId('v'), x: W, z: D };
  const v3 = { id: genId('v'), x: 0, z: D };
  const south = { id: genId('w'), startId: v0.id, endId: v1.id };
  const east = { id: genId('w'), startId: v1.id, endId: v2.id };
  const north = { id: genId('w'), startId: v2.id, endId: v3.id };
  const west = { id: genId('w'), startId: v3.id, endId: v0.id };
  const wallMap: Record<WallId, string> = {
    south: south.id,
    east: east.id,
    north: north.id,
    west: west.id,
  };
  const openings: FloorPlanOpening[] = [
    {
      id: genId('o'),
      wallId: south.id,
      kind: 'door',
      offset: W / 2 - DOOR.width / 2,
      width: DOOR.width,
      height: DOOR.height,
      hinge: 'left',
    },
  ];
  for (const win of legacy.windows) {
    const wallId = wallMap[win.wall];
    const wallLen = win.wall === 'north' || win.wall === 'south' ? W : D;
    openings.push({
      id: genId('o'),
      wallId,
      kind: 'window',
      offset: wallLen / 2 + win.x - win.w / 2,
      width: win.w,
      height: win.h,
      sill: win.y,
    });
  }
  return normalizePlanOrigin({
    version: FLOOR_PLAN_VERSION,
    height: legacy.height,
    vertices: [v0, v1, v2, v3],
    walls: [south, east, north, west],
    openings,
  });
}

export function floorPlanToLegacyBounds(plan: FloorPlan): { width: number; depth: number; height: number } {
  const b = planBounds(plan);
  return { width: b.width, depth: b.depth, height: plan.height };
}

export function parseFloorPlan(raw: unknown): FloorPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  if (o.version === FLOOR_PLAN_VERSION) {
    if (!Array.isArray(o.vertices) || !Array.isArray(o.walls) || !Array.isArray(o.openings)) {
      return null;
    }
    if (typeof o.height !== 'number') return null;
    const vertices: FloorPlanVertex[] = [];
    for (const v of o.vertices) {
      if (!v || typeof v !== 'object') continue;
      const r = v as Record<string, unknown>;
      if (typeof r.id !== 'string' || typeof r.x !== 'number' || typeof r.z !== 'number') continue;
      vertices.push({ id: r.id, x: r.x, z: r.z });
    }
    const walls: FloorPlanWall[] = [];
    for (const w of o.walls) {
      if (!w || typeof w !== 'object') continue;
      const r = w as Record<string, unknown>;
      if (typeof r.id !== 'string' || typeof r.startId !== 'string' || typeof r.endId !== 'string') continue;
      walls.push({ id: r.id, startId: r.startId, endId: r.endId });
    }
    const openings: FloorPlanOpening[] = [];
    for (const op of o.openings) {
      if (!op || typeof op !== 'object') continue;
      const r = op as Record<string, unknown>;
      if (typeof r.id !== 'string' || typeof r.wallId !== 'string') continue;
      if (r.kind !== 'door' && r.kind !== 'window') continue;
      if (typeof r.offset !== 'number' || typeof r.width !== 'number' || typeof r.height !== 'number') continue;
      openings.push({
        id: r.id,
        wallId: r.wallId,
        kind: r.kind,
        offset: r.offset,
        width: r.width,
        height: r.height,
        sill: typeof r.sill === 'number' ? r.sill : undefined,
        hinge: r.hinge === 'left' || r.hinge === 'right' ? r.hinge : undefined,
      });
    }
    return clampPlan(normalizePlanOrigin(sanitizeWallGraph({ version: FLOOR_PLAN_VERSION, height: o.height, vertices, walls, openings })));
  }

  // Legacy v1 box format
  if (typeof o.width === 'number' && typeof o.depth === 'number' && typeof o.height === 'number') {
    const windows: RoomWindow[] = [];
    if (Array.isArray(o.windows)) {
      for (const entry of o.windows) {
        if (!entry || typeof entry !== 'object') continue;
        const w = entry as Record<string, unknown>;
        const wall = w.wall;
        if (wall !== 'north' && wall !== 'south' && wall !== 'east' && wall !== 'west') continue;
        if (typeof w.x !== 'number' || typeof w.y !== 'number') continue;
        if (typeof w.w !== 'number' || typeof w.h !== 'number') continue;
        windows.push({ wall, x: w.x, y: w.y, w: w.w, h: w.h });
      }
    }
    return legacyToFloorPlan({
      width: clamp(o.width, 60, 360),
      depth: clamp(o.depth, 60, 480),
      height: clamp(o.height, 72, 144),
      windows,
    });
  }

  return null;
}

export function serializeFloorPlan(plan: FloorPlan): FloorPlan {
  return clampPlan(normalizePlanOrigin(sanitizeWallGraph(plan)));
}
