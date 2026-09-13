import { planBounds, planCentroid } from './floorPlanGeometry';
import type { FloorPlan } from './floorPlanGeometry';
import type { MeasureAcceptField, MeasureVec3 } from './measureDistance';

export const MEASURE_POINT_OFFSET_IN = 24;

export interface MeasureDraft {
  a: MeasureVec3;
  b: MeasureVec3;
  acceptField: MeasureAcceptField | null;
  /** True when measuring to fill import form fields (Enter/Escape owned by banner). */
  importAccept: boolean;
  activeEndpoint: 'a' | 'b' | null;
  draggingEndpoint: 'a' | 'b' | null;
}

/** Default Y for new measure points — same feel as addLightSource. */
export function defaultMeasureHeight(room: FloorPlan): number {
  const centerY = Math.round(Math.min(60, Math.max(28, room.height * 0.45)));
  return Math.max(0, Math.min(centerY, room.height));
}

export function clampMeasurePoint(
  world: MeasureVec3,
  room: FloorPlan,
): MeasureVec3 {
  const bounds = planBounds(room);
  const pad = 6;
  return [
    Math.max(bounds.minX + pad, Math.min(bounds.maxX - pad, world[0])),
    Math.max(0, Math.min(room.height, world[1])),
    Math.max(bounds.minZ + pad, Math.min(bounds.maxZ - pad, world[2])),
  ];
}

export function spawnMeasureDraft(
  room: FloorPlan,
  acceptField: MeasureAcceptField | null = null,
  importAccept = false,
): MeasureDraft {
  const [cx, cz] = planCentroid(room);
  const y = defaultMeasureHeight(room);
  const a = clampMeasurePoint([cx, y, cz], room);
  const b = clampMeasurePoint(
    [a[0] + MEASURE_POINT_OFFSET_IN, y, a[2]],
    room,
  );
  return {
    a,
    b,
    acceptField,
    importAccept,
    activeEndpoint: 'a',
    draggingEndpoint: null,
  };
}

export function setMeasureEndpoint(
  draft: MeasureDraft,
  endpoint: 'a' | 'b',
  world: MeasureVec3,
  room: FloorPlan,
): MeasureDraft {
  const clamped = clampMeasurePoint(world, room);
  if (endpoint === 'a') return { ...draft, a: clamped };
  return { ...draft, b: clamped };
}

export function setMeasureActiveEndpoint(
  draft: MeasureDraft,
  endpoint: 'a' | 'b' | null,
): MeasureDraft {
  if (draft.draggingEndpoint) return draft;
  return { ...draft, activeEndpoint: endpoint };
}

export function beginMeasureEndpointDrag(
  draft: MeasureDraft,
  endpoint: 'a' | 'b',
): MeasureDraft {
  return {
    ...draft,
    draggingEndpoint: endpoint,
    activeEndpoint: endpoint,
  };
}

export function endMeasureEndpointDrag(draft: MeasureDraft): MeasureDraft {
  return { ...draft, draggingEndpoint: null };
}

export function activeMeasureEndpoint(draft: MeasureDraft): MeasureVec3 | null {
  if (draft.activeEndpoint === 'a') return draft.a;
  if (draft.activeEndpoint === 'b') return draft.b;
  return null;
}
