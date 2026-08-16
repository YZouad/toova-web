/**
 * Blank floor-plan shortcuts shown in the “Blank room” section of the starter picker.
 * Furnished starters live in `roomStarterTemplates.ts`.
 */

import {
  BLANK_PLAN_PRESETS,
  getBlankPlanPreset,
  type BlankPlanPreset,
  type BlankPlanPresetId,
} from './roomStarterTemplates';

/** @deprecated Prefer BlankPlanPresetId — kept for existing imports. */
export type RoomPlanPresetId = BlankPlanPresetId;

/** @deprecated Prefer BlankPlanPreset — kept for existing imports. */
export type RoomPlanPreset = BlankPlanPreset;

/** Static empty floor-plan shortcuts. */
export const ROOM_PLAN_PRESETS = BLANK_PLAN_PRESETS;

export function getRoomPlanPreset(id: RoomPlanPresetId): RoomPlanPreset | undefined {
  return getBlankPlanPreset(id);
}

export {
  BLANK_PLAN_PRESETS,
  getBlankPlanPreset,
  type BlankPlanPreset,
  type BlankPlanPresetId,
};
