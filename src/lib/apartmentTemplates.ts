/**
 * Apartment starter floor plans: multiple tagged rooms + interior doors.
 */

import {
  FLOOR_PLAN_VERSION,
  addOpeningAt,
  genId,
  normalizePlanOrigin,
  sanitizeWallGraph,
  serializeFloorPlan,
  setZoneTag,
  type FloorPlan,
} from './floorPlanGeometry';
import { ROOM } from '../units';

export interface ApartmentRoomRect {
  /** Origin of the room rectangle (inches). */
  x: number;
  z: number;
  width: number;
  depth: number;
  tag: Parameters<typeof setZoneTag>[3];
  name?: string;
}

/**
 * Compose axis-aligned room rectangles into one FloorPlan.
 * Shared edges become partition walls via sanitizeWallGraph.
 */
export function composeRoomsPlan(
  rooms: ApartmentRoomRect[],
  height = ROOM.height,
): FloorPlan {
  const vertices: FloorPlan['vertices'] = [];
  const walls: FloorPlan['walls'] = [];
  const vertKey = new Map<string, string>();

  const vertexAt = (x: number, z: number): string => {
    const key = `${x},${z}`;
    const existing = vertKey.get(key);
    if (existing) return existing;
    const id = genId('v');
    vertKey.set(key, id);
    vertices.push({ id, x, z });
    return id;
  };

  const addWall = (ax: number, az: number, bx: number, bz: number) => {
    const startId = vertexAt(ax, az);
    const endId = vertexAt(bx, bz);
    if (startId === endId) return;
    // Skip exact duplicates (same endpoints either direction).
    const dup = walls.some(
      (w) =>
        (w.startId === startId && w.endId === endId) ||
        (w.startId === endId && w.endId === startId),
    );
    if (dup) return;
    walls.push({ id: genId('w'), startId, endId });
  };

  for (const room of rooms) {
    const x0 = room.x;
    const z0 = room.z;
    const x1 = room.x + room.width;
    const z1 = room.z + room.depth;
    addWall(x0, z0, x1, z0);
    addWall(x1, z0, x1, z1);
    addWall(x1, z1, x0, z1);
    addWall(x0, z1, x0, z0);
  }

  let plan: FloorPlan = sanitizeWallGraph(
    normalizePlanOrigin({
      version: FLOOR_PLAN_VERSION,
      height,
      vertices,
      walls,
      openings: [],
      zones: [],
    }),
  );

  // Tag each room at its center.
  for (const room of rooms) {
    const cx = room.x + room.width / 2;
    const cz = room.z + room.depth / 2;
    plan = setZoneTag(plan, cx, cz, room.tag, room.name);
  }

  return serializeFloorPlan(plan);
}

/** Studio: living area + bath. */
export function studioApartmentPlan(): FloorPlan {
  let plan = composeRoomsPlan([
    { x: 0, z: 0, width: 168, depth: 144, tag: 'living_room', name: 'Studio' },
    { x: 168, z: 0, width: 72, depth: 84, tag: 'bathroom', name: 'Bath' },
  ]);
  // Door between studio and bath on the shared wall at x=168.
  plan = addOpeningAt(plan, 168, 42, 'door', 32);
  // Exterior entry on south wall of studio.
  plan = addOpeningAt(plan, 84, 0, 'door', 32);
  return serializeFloorPlan(plan);
}

/** 1 bedroom: living, bedroom, bath. */
export function oneBedroomApartmentPlan(): FloorPlan {
  let plan = composeRoomsPlan([
    { x: 0, z: 0, width: 168, depth: 144, tag: 'living_room', name: 'Living' },
    { x: 168, z: 0, width: 132, depth: 144, tag: 'bedroom', name: 'Bedroom' },
    { x: 168, z: 144, width: 72, depth: 72, tag: 'bathroom', name: 'Bath' },
  ]);
  plan = addOpeningAt(plan, 168, 72, 'door', 32);
  plan = addOpeningAt(plan, 204, 144, 'door', 28);
  plan = addOpeningAt(plan, 84, 0, 'door', 32);
  return serializeFloorPlan(plan);
}

/** 2 bedroom: living, two bedrooms, bath. */
export function twoBedroomApartmentPlan(): FloorPlan {
  let plan = composeRoomsPlan([
    { x: 0, z: 0, width: 180, depth: 156, tag: 'living_room', name: 'Living' },
    { x: 180, z: 0, width: 132, depth: 120, tag: 'bedroom', name: 'Bedroom 1' },
    { x: 180, z: 120, width: 132, depth: 108, tag: 'bedroom', name: 'Bedroom 2' },
    { x: 0, z: 156, width: 84, depth: 72, tag: 'bathroom', name: 'Bath' },
  ]);
  plan = addOpeningAt(plan, 180, 60, 'door', 32);
  plan = addOpeningAt(plan, 180, 174, 'door', 32);
  plan = addOpeningAt(plan, 42, 156, 'door', 28);
  plan = addOpeningAt(plan, 90, 0, 'door', 32);
  return serializeFloorPlan(plan);
}

/** Empty apartment canvas (~40′ × 30′) for freehand drawing. */
export function emptyApartmentCanvasPlan(): FloorPlan {
  return {
    version: FLOOR_PLAN_VERSION,
    height: ROOM.height,
    vertices: [],
    walls: [],
    openings: [],
    zones: [],
  };
}

export const APARTMENT_CANVAS_WIDTH = 480; // 40 ft
export const APARTMENT_CANVAS_DEPTH = 360; // 30 ft
