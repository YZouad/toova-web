import { DOOR, ROOM, WINDOW } from '../../units';
import { isRoomTag } from '../roomTags';
import {
  addOpeningAt,
  clampPlan,
  clampPlanHeight,
  emptyPlan,
  genId,
  GRID_SNAP_IN,
  MIN_WALL_LENGTH,
  MIN_WINDOW_WIDTH,
  serializeFloorPlan,
  setZoneTag,
  snapToGrid,
  type FloorPlan,
  type FloorPlanVertex,
  type FloorPlanWall,
} from '../floorPlanGeometry';
import type { IngestVisionResult, PixelGap, PixelGraph, PixelSegment } from './types';

const SNAP_IN = GRID_SNAP_IN;

function isHorizontal(s: PixelSegment): boolean {
  return Math.abs(s.y0 - s.y1) < 2;
}

function isVertical(s: PixelSegment): boolean {
  return Math.abs(s.x0 - s.x1) < 2;
}

function clusterCoord(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const centers: number[] = [];
  for (const v of sorted) {
    const hit = centers.find((c) => Math.abs(c - v) <= tol);
    if (hit !== undefined) {
      const i = centers.indexOf(hit);
      centers[i] = (hit + v) / 2;
    } else {
      centers.push(v);
    }
  }
  return centers;
}

function snapClusterPx(v: number, centers: number[], tol: number): number {
  let best = v;
  let dMin = tol;
  for (const c of centers) {
    const d = Math.abs(c - v);
    if (d < dMin) {
      dMin = d;
      best = c;
    }
  }
  return best;
}

function vertexKey(x: number, z: number): string {
  const sx = snapToGrid(x, SNAP_IN);
  const sz = snapToGrid(z, SNAP_IN);
  return `${sx},${sz}`;
}

function snapSegmentsToJunctions(segments: PixelSegment[], snapPx: number): PixelSegment[] {
  const xs = segments.flatMap((s) => [s.x0, s.x1]);
  const ys = segments.flatMap((s) => [s.y0, s.y1]);
  const xCenters = clusterCoord(xs, snapPx);
  const yCenters = clusterCoord(ys, snapPx);
  return segments.map((s) => ({
    ...s,
    x0: snapClusterPx(s.x0, xCenters, snapPx * 2),
    x1: snapClusterPx(s.x1, xCenters, snapPx * 2),
    y0: snapClusterPx(s.y0, yCenters, snapPx * 2),
    y1: snapClusterPx(s.y1, yCenters, snapPx * 2),
  }));
}

function segmentLengthIn(s: PixelSegment, ipp: number): number {
  const dx = (s.x1 - s.x0) * ipp;
  const dz = (s.y1 - s.y0) * ipp;
  return Math.hypot(dx, dz);
}

function pxToInX(x: number, ipp: number): number {
  return snapToGrid(x * ipp, SNAP_IN);
}

function pxToInZ(y: number, ipp: number): number {
  return snapToGrid(y * ipp, SNAP_IN);
}

function gapLengthPx(g: PixelGap): number {
  return Math.hypot(g.x1 - g.x0, g.y1 - g.y0);
}

export function pixelGraphToFloorPlan(
  graph: PixelGraph,
  inchesPerPixel: number,
  opts?: {
    height?: number;
    vision?: IngestVisionResult;
    /** Pixel centroids for vision face ids (from assignFaceMarks). */
    faceMarks?: { id: string; cx: number; cy: number }[];
  },
): {
  plan: FloorPlan;
  uncertainWallIds: string[];
  uncertainOpeningIds: string[];
  faceCount: number;
} {
  const ipp = inchesPerPixel;
  const snapPx = Math.max(4, 8 / Math.max(ipp, 0.25));
  const axisSegs = graph.segments.filter((s) => isHorizontal(s) || isVertical(s));
  const segments = snapSegmentsToJunctions(
    axisSegs.length >= 3 ? axisSegs : graph.segments,
    snapPx,
  );
  const vertexMap = new Map<string, FloorPlanVertex>();
  const uncertainWallIds: string[] = [];

  const junctionTolPx = snapPx * 2;
  const xClusters = clusterCoord(segments.flatMap((s) => [s.x0, s.x1]), junctionTolPx);
  const yClusters = clusterCoord(segments.flatMap((s) => [s.y0, s.y1]), junctionTolPx);

  const getOrCreateVertex = (xPx: number, yPx: number): FloorPlanVertex => {
    const cx = snapClusterPx(xPx, xClusters, junctionTolPx);
    const cy = snapClusterPx(yPx, yClusters, junctionTolPx);
    const x = snapToGrid(cx * ipp, SNAP_IN);
    const z = snapToGrid(cy * ipp, SNAP_IN);
    const key = vertexKey(x, z);
    const existing = vertexMap.get(key);
    if (existing) return existing;
    const v: FloorPlanVertex = { id: genId('v'), x, z };
    vertexMap.set(key, v);
    return v;
  };

  const walls: FloorPlanWall[] = [];
  for (const s of segments) {
    const lenIn = segmentLengthIn(s, ipp);
    if (lenIn < MIN_WALL_LENGTH) continue;
    const v0 = getOrCreateVertex(s.x0, s.y0);
    const v1 = getOrCreateVertex(s.x1, s.y1);
    if (v0.id === v1.id) continue;
    const id = genId('w');
    walls.push({ id, startId: v0.id, endId: v1.id });
    if ((s.confidence ?? 1) < 0.6 || !isHorizontal(s) && !isVertical(s)) {
      uncertainWallIds.push(id);
    }
  }

  let plan = clampPlan({
    ...emptyPlan(),
    height: clampPlanHeight(opts?.height ?? ROOM.height),
    vertices: [...vertexMap.values()],
    walls,
    openings: [],
  });

  const uncertainOpeningIds: string[] = [];

  for (const g of graph.gaps) {
    const gapPx = gapLengthPx(g);
    const widthIn = snapToGrid(gapPx * ipp, SNAP_IN);
    const cx = pxToInX((g.x0 + g.x1) / 2, ipp);
    const cz = pxToInZ((g.y0 + g.y1) / 2, ipp);
    const hint = g.kindHint ?? 'opening';
    const conf = g.confidence ?? 0.5;

    if (hint === 'window' && widthIn >= MIN_WINDOW_WIDTH) {
      const before = plan.openings.length;
      plan = addOpeningAt(plan, cx, cz, 'window', Math.min(widthIn, WINDOW.width), WINDOW.height);
      if (plan.openings.length > before) {
        const o = plan.openings[plan.openings.length - 1]!;
        if (conf < 0.6) uncertainOpeningIds.push(o.id);
      }
    } else if (hint === 'door' || hint === 'opening') {
      const before = plan.openings.length;
      const w = Math.max(12, Math.min(widthIn, DOOR.width));
      plan = addOpeningAt(plan, cx, cz, 'door', w, DOOR.height);
      if (plan.openings.length > before) {
        const o = plan.openings[plan.openings.length - 1]!;
        const hinge = g.hinge ?? 'left';
        const openings = plan.openings.map((op) =>
          op.id === o.id
            ? {
                ...op,
                hinge,
                ...(hint === 'opening' ? { doorless: true as const } : {}),
              }
            : op,
        );
        plan = { ...plan, openings };
        if (conf < 0.6) uncertainOpeningIds.push(o.id);
      }
    }
  }

  const vision = opts?.vision;
  const faceMarks = opts?.faceMarks;
  if (vision) {
    for (const face of vision.faces) {
      if (!face.tag || !isRoomTag(face.tag)) continue;
      const mark = faceMarks?.find((m) => m.id === face.id);
      if (!mark) continue;
      const x = pxToInX(mark.cx, ipp);
      const z = pxToInZ(mark.cy, ipp);
      plan = setZoneTag(
        plan,
        x,
        z,
        face.tag as import('../roomTags').RoomTag,
        face.label,
      );
    }
    for (const vg of vision.gaps) {
      const pg = graph.gaps.find((g) => g.id === vg.id);
      if (!pg) continue;
      const cx = pxToInX((pg.x0 + pg.x1) / 2, ipp);
      const cz = pxToInZ((pg.y0 + pg.y1) / 2, ipp);
      if (vg.kind === 'window') {
        plan = addOpeningAt(plan, cx, cz, 'window', WINDOW.width, WINDOW.height);
      } else if (vg.kind === 'door') {
        plan = addOpeningAt(plan, cx, cz, 'door', DOOR.width, DOOR.height);
      } else if (vg.kind === 'opening') {
        const before = plan.openings.length;
        plan = addOpeningAt(plan, cx, cz, 'door', DOOR.width, DOOR.height);
        if (plan.openings.length > before) {
          const o = plan.openings[plan.openings.length - 1]!;
          plan = {
            ...plan,
            openings: plan.openings.map((op) =>
              op.id === o.id ? { ...op, doorless: true } : op,
            ),
          };
        }
      }
    }
  }

  plan = serializeFloorPlan(plan);
  const faceCount = Math.max(1, new Set(plan.walls.map((w) => w.id)).size >= 3 ? 1 : 0);

  return {
    plan,
    uncertainWallIds,
    uncertainOpeningIds,
    faceCount,
  };
}