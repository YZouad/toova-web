/**
 * Whole-apartment helpers: resolve enclosed faces into selectable rooms,
 * derive a single-room FloorPlan for focus mode, and assign items to rooms.
 *
 * Room identity is the zone id when tagged; untagged faces use a session-only
 * `face:<faceKey>` key that cannot be deep-linked.
 */

import type { FloorPlan, FloorPlanVertex, FloorPlanZone, ResolvedArea } from './floorPlanGeometry';
import {
  faceLoopKey,
  faceWallIds,
  FLOOR_PLAN_VERSION,
  pointInFace,
  resolveZones,
  zoneAnchorFor,
} from './floorPlanGeometry';
import { roomTagLabel, type RoomTag } from './roomTags';

/** Stable id for a tagged room (= zone.id). Untagged: `face:<faceKey>`. */
export type ApartmentRoomId = string;

export interface ApartmentRoom {
  id: ApartmentRoomId;
  faceKey: string;
  face: FloorPlanVertex[];
  areaSqIn: number;
  labelAnchor: [number, number];
  zone: FloorPlanZone | null;
  /** Display name: custom zone name, tag label, or "Untitled area". */
  label: string;
  tag: RoomTag | null;
  wallIds: string[];
  tagged: boolean;
}

export interface ItemPlanPoint {
  id: string;
  /** Footprint / hanging center in plan inches. */
  x: number;
  z: number;
}

/** True when the plan has 2+ tagged zones — opens in apartment overview. */
export function isApartmentPlan(plan: FloorPlan): boolean {
  const tagged = (plan.zones ?? []).length;
  if (tagged >= 2) return true;
  // Also accept resolveZones in case zones were pruned but faces still tagged.
  return resolveZones(plan).filter((a) => a.zone != null).length >= 2;
}

export function untitledRoomLabel(index: number): string {
  return index <= 0 ? 'Untitled area' : `Untitled area ${index + 1}`;
}

/** Resolve every enclosed face into an ApartmentRoom (tagged + untagged). */
export function resolveApartmentRooms(plan: FloorPlan): ApartmentRoom[] {
  const areas = resolveZones(plan);
  let untitledIndex = 0;
  return areas.map((area) => areaToRoom(plan, area, untitledIndex++));
}

function areaToRoom(plan: FloorPlan, area: ResolvedArea, untitledIndex: number): ApartmentRoom {
  const tagged = area.zone != null;
  const id = tagged ? area.zone!.id : `face:${area.faceKey}`;
  const tag = area.zone?.tag ?? null;
  const label = tagged
    ? area.zone!.name?.trim() || roomTagLabel(area.zone!.tag)
    : untitledRoomLabel(untitledIndex);
  return {
    id,
    faceKey: area.faceKey,
    face: area.face,
    areaSqIn: area.areaSqIn,
    labelAnchor: area.labelAnchor,
    zone: area.zone,
    label,
    tag,
    wallIds: faceWallIds(plan, area.face),
    tagged,
  };
}

export function apartmentRoomById(plan: FloorPlan, id: ApartmentRoomId): ApartmentRoom | null {
  return resolveApartmentRooms(plan).find((r) => r.id === id) ?? null;
}

/** Find the room whose floor contains (x, z), or null. */
export function roomAtFloorPoint(plan: FloorPlan, x: number, z: number): ApartmentRoom | null {
  const rooms = resolveApartmentRooms(plan);
  return rooms.find((r) => pointInFace(x, z, r.face)) ?? null;
}

/**
 * Build a valid single-loop FloorPlan for one apartment room.
 * Includes boundary walls, openings on those walls, height, and the room's zone.
 */
export function planForFace(plan: FloorPlan, room: ApartmentRoom): FloorPlan {
  const wallIdSet = new Set(room.wallIds);
  const walls = plan.walls.filter((w) => wallIdSet.has(w.id));
  const vertIds = new Set<string>();
  for (const w of walls) {
    vertIds.add(w.startId);
    vertIds.add(w.endId);
  }
  // Prefer face vertex order; fall back to wall endpoints.
  for (const v of room.face) vertIds.add(v.id);
  const vertices = plan.vertices.filter((v) => vertIds.has(v.id));
  const openings = plan.openings.filter((o) => wallIdSet.has(o.wallId));
  const zones = room.zone ? [room.zone] : [];
  return {
    version: FLOOR_PLAN_VERSION,
    height: plan.height,
    vertices,
    walls,
    openings,
    zones,
  };
}

/** Convenience: plan for a room id, or null when the id is unknown. */
export function planForRoomId(plan: FloorPlan, roomId: ApartmentRoomId): FloorPlan | null {
  const room = apartmentRoomById(plan, roomId);
  if (!room) return null;
  return planForFace(plan, room);
}

/** Room key for an item center, or null when outside every face ("unplaced"). */
export function itemRoomKey(
  plan: FloorPlan,
  x: number,
  z: number,
): ApartmentRoomId | null {
  return roomAtFloorPoint(plan, x, z)?.id ?? null;
}

export function itemBelongsToRoom(
  plan: FloorPlan,
  item: ItemPlanPoint,
  roomId: ApartmentRoomId,
): boolean {
  return itemRoomKey(plan, item.x, item.z) === roomId;
}

/**
 * Group items by apartment room id. Items outside every face land under
 * the sentinel key {@link UNPLACED_ROOM_KEY}.
 */
export const UNPLACED_ROOM_KEY = '__unplaced__';

export function groupItemsByRoom(
  plan: FloorPlan,
  items: ItemPlanPoint[],
): Map<string, string[]> {
  const rooms = resolveApartmentRooms(plan);
  const byId = new Map<string, string[]>();
  for (const r of rooms) byId.set(r.id, []);
  byId.set(UNPLACED_ROOM_KEY, []);

  for (const item of items) {
    const key = itemRoomKey(plan, item.x, item.z) ?? UNPLACED_ROOM_KEY;
    const list = byId.get(key) ?? [];
    list.push(item.id);
    byId.set(key, list);
  }
  return byId;
}

/** Plan-space point used for membership (item footprint center). */
export function itemPlanPoint(item: {
  position: [number, number, number];
  hanging?: { anchors: Array<{ surface: string }> } | null;
}): [number, number] {
  return [item.position[0], item.position[2]];
}

/** Label used when auto-creating a zone from the naming picker. */
export function defaultRoomName(tag: RoomTag, existing: ApartmentRoom[]): string {
  const base = roomTagLabel(tag);
  const same = existing.filter((r) => r.tag === tag).length;
  if (same === 0) return base;
  return `${base} ${same + 1}`;
}

/** Prefer a stable spawn point inside a room (zone anchor, else face centroid). */
export function roomSpawnPoint(room: ApartmentRoom): [number, number] {
  if (room.zone) return [room.zone.x, room.zone.z];
  if (pointInFace(room.labelAnchor[0], room.labelAnchor[1], room.face)) {
    return room.labelAnchor;
  }
  return zoneAnchorFor(room.face);
}

/**
 * Geometry used by collision, cameras, lighting, and measure while a room is
 * focused. Falls back to the full plan when nothing is focused (or the id is stale).
 */
export function activeGeometryFor(
  plan: FloorPlan,
  focusedRoomId: ApartmentRoomId | null,
): FloorPlan {
  if (!focusedRoomId) return plan;
  return planForRoomId(plan, focusedRoomId) ?? plan;
}

export type ApartmentMode = 'single' | 'overview' | 'focused';

export function apartmentModeFor(
  plan: FloorPlan,
  focusedRoomId: ApartmentRoomId | null,
): ApartmentMode {
  if (!isApartmentPlan(plan)) return 'single';
  return focusedRoomId ? 'focused' : 'overview';
}

/** True when an item should render / collide while `focusedRoomId` is set. */
export function itemVisibleInFocus(
  plan: FloorPlan,
  focusedRoomId: ApartmentRoomId | null,
  item: ItemPlanPoint,
): boolean {
  if (!focusedRoomId) return true;
  return itemRoomKey(plan, item.x, item.z) === focusedRoomId;
}

/** Keep focus only when the zone still exists after a plan edit. */
export function reconcileFocusedRoomId(
  plan: FloorPlan,
  focusedRoomId: ApartmentRoomId | null,
): ApartmentRoomId | null {
  if (!focusedRoomId) return null;
  if (!isApartmentPlan(plan)) return null;
  return apartmentRoomById(plan, focusedRoomId)?.id ?? null;
}
