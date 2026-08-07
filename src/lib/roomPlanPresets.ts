import {
  type FloorPlan,
  formatLength,
  lShapePlan,
  planBounds,
  rectanglePlan,
} from './floorPlanGeometry';
import { ROOM } from '../units';

export type RoomPlanPresetId = 'rectangle' | 'square' | 'l-shape';

export interface RoomPlanPreset {
  id: RoomPlanPresetId;
  label: string;
  description: string;
  /** Human-readable footprint, e.g. "8′ 5″ × 15′". */
  dimensionsLabel: string;
  build: () => FloorPlan;
}

function dimensionsLabelFor(plan: FloorPlan): string {
  const b = planBounds(plan);
  const w = formatLength(b.maxX - b.minX, 'ft-in');
  const d = formatLength(b.maxZ - b.minZ, 'ft-in');
  return `${w} × ${d}`;
}

function withDimensions(
  preset: Omit<RoomPlanPreset, 'dimensionsLabel'>,
): RoomPlanPreset {
  return {
    ...preset,
    dimensionsLabel: dimensionsLabelFor(preset.build()),
  };
}

/** Static floor-plan shortcuts shown after naming a new room. */
export const ROOM_PLAN_PRESETS: readonly RoomPlanPreset[] = [
  withDimensions({
    id: 'rectangle',
    label: 'Rectangle',
    description: 'A classic rectangular room with a door and window.',
    build: () => rectanglePlan(ROOM.width, ROOM.depth, ROOM.height),
  }),
  withDimensions({
    id: 'square',
    label: 'Square',
    description: 'An even square footprint — easy to furnish.',
    build: () => rectanglePlan(120, 120, ROOM.height),
  }),
  withDimensions({
    id: 'l-shape',
    label: 'L-shape',
    description: 'An L-shaped layout with a door on the long wall.',
    build: () => lShapePlan(120, 120, 48, 48, ROOM.height),
  }),
];

export function getRoomPlanPreset(id: RoomPlanPresetId): RoomPlanPreset | undefined {
  return ROOM_PLAN_PRESETS.find((p) => p.id === id);
}
