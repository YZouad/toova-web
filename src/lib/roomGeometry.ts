/**
 * Room geometry — v2 floor-plan model with legacy adapters.
 */

import {
  type FloorPlan,
  type FloorPlanOpening,
  type LegacyRoomGeometry,
  type OpeningWorldPlacement,
  type RoomWindow,
  type WallId,
  type WallSegment,
  defaultRectanglePlan,
  floorPlanToLegacyBounds,
  floorFaceLoops,
  holesForWallSegment,
  openingWorldPlacement,
  parseFloorPlan,
  planBounds,
  planCentroid,
  serializeFloorPlan,
  windowOpenings,
  doorOpenings,
  allWallSegments,
  clampPlan,
  clampPlanHeight,
  outerFaceVertices,
  sanitizeWallGraph,
} from './floorPlanGeometry';

export type RoomGeometry = FloorPlan;

export type {
  FloorPlan,
  FloorPlanOpening,
  LegacyRoomGeometry,
  OpeningWorldPlacement,
  RoomWindow,
  WallId,
  WallSegment,
};

export {
  defaultRectanglePlan,
  floorPlanToLegacyBounds,
  floorFaceLoops,
  holesForWallSegment,
  openingWorldPlacement,
  parseFloorPlan,
  planBounds,
  planCentroid,
  serializeFloorPlan,
  windowOpenings,
  doorOpenings,
  allWallSegments,
  clampPlan,
  clampPlanHeight,
  outerFaceVertices,
  sanitizeWallGraph,
};

export const DEFAULT_ROOM_GEOMETRY: RoomGeometry = defaultRectanglePlan();

export function normalizeRoomGeometry(geom: RoomGeometry): RoomGeometry {
  return clampPlan(sanitizeWallGraph(structuredClone(geom)));
}

/** @deprecated Use parseFloorPlan */
export function parseRoomGeometry(raw: unknown): RoomGeometry | null {
  return parseFloorPlan(raw);
}

/** @deprecated Use clampPlan */
export function clampRoomGeometry(geom: RoomGeometry): RoomGeometry {
  return clampPlan(geom);
}

export interface WindowWorldPlacement {
  cx: number;
  cy: number;
  cz: number;
  outward: [number, number, number];
  w: number;
  h: number;
}

/** World-space center and outward normal for a window opening. */
export function windowWorldPlacement(geom: RoomGeometry, win: FloorPlanOpening): WindowWorldPlacement {
  const p = openingWorldPlacement(geom, win);
  if (!p) {
    return { cx: 0, cy: 0, cz: 0, outward: [0, 0, 1], w: win.width, h: win.height };
  }
  return {
    cx: p.cx,
    cy: p.cy,
    cz: p.cz,
    outward: p.outward,
    w: p.w,
    h: p.h,
  };
}

/** Legacy helper — bounding width for rectangular-ish plans. */
export function wallLength(geom: RoomGeometry, _wall: WallId): number {
  const b = planBounds(geom);
  return b.width;
}

/** @deprecated Legacy cardinal walls — returns window holes for v1 wall id on rectangle plans only. */
export function holesForWall(geom: RoomGeometry, wall: WallId) {
  const b = planBounds(geom);
  const W = b.width;
  const D = b.depth;
  const wallIdMap: Record<WallId, (w: FloorPlanOpening) => boolean> = {
    south: (o) => {
      const seg = allWallSegments(geom).find((s) => Math.abs(s.start.z) < 1 && Math.abs(s.end.z) < 1);
      return seg ? o.wallId === seg.wall.id : false;
    },
    north: (o) => {
      const seg = allWallSegments(geom).find((s) => Math.abs(s.start.z - D) < 1 && Math.abs(s.end.z - D) < 1);
      return seg ? o.wallId === seg.wall.id : false;
    },
    west: (o) => {
      const seg = allWallSegments(geom).find((s) => Math.abs(s.start.x) < 1 && Math.abs(s.end.x) < 1);
      return seg ? o.wallId === seg.wall.id : false;
    },
    east: (o) => {
      const seg = allWallSegments(geom).find((s) => Math.abs(s.start.x - W) < 1 && Math.abs(s.end.x - W) < 1);
      return seg ? o.wallId === seg.wall.id : false;
    },
  };
  const seg = allWallSegments(geom).find((s) => wallIdMap[wall]({ wallId: s.wall.id } as FloorPlanOpening));
  if (!seg) return [];
  return windowOpenings(geom)
    .filter((o) => o.wallId === seg.wall.id)
    .map((o) => ({
      x: o.offset + o.width / 2 - seg.length / 2,
      y: o.sill ?? 36,
      w: o.width,
      h: o.height,
    }));
}
