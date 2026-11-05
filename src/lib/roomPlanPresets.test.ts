import { describe, expect, it } from 'vitest';
import { isValidFloorPlan, serializeFloorPlan } from './floorPlanGeometry';
import { getRoomPlanPreset, ROOM_PLAN_PRESETS } from './roomPlanPresets';

describe('roomPlanPresets (blank shapes)', () => {
  const enclosedPresets = ROOM_PLAN_PRESETS.filter((p) => p.id !== 'apartment');

  it('exposes three room shapes plus the apartment drawing canvas', () => {
    expect(ROOM_PLAN_PRESETS.map((p) => p.id)).toEqual(['rectangle', 'square', 'l-shape', 'apartment']);
  });

  it('apartment preset is an empty canvas for drawing rooms', () => {
    const plan = getRoomPlanPreset('apartment')!.build();
    expect(plan.walls).toHaveLength(0);
    expect(getRoomPlanPreset('apartment')!.dimensionsLabel.length).toBeGreaterThan(0);
  });

  it('each room shape builds a valid serializable floor plan', () => {
    for (const preset of enclosedPresets) {
      const plan = serializeFloorPlan(preset.build());
      expect(isValidFloorPlan(plan), preset.id).toBe(true);
      expect(plan.vertices.length).toBeGreaterThanOrEqual(4);
      expect(plan.walls.length).toBeGreaterThanOrEqual(4);
      expect(plan.openings.some((o) => o.kind === 'door'), preset.id).toBe(true);
      expect(preset.dimensionsLabel.length).toBeGreaterThan(0);
    }
  });

  it('build() returns a fresh plan each call', () => {
    for (const preset of enclosedPresets) {
      const a = preset.build();
      const b = preset.build();
      expect(a).not.toBe(b);
      expect(a.vertices[0]?.id).not.toBe(b.vertices[0]?.id);
    }
  });

  it('looks up presets by id', () => {
    expect(getRoomPlanPreset('square')?.label).toBe('Square');
    expect(getRoomPlanPreset('missing' as 'rectangle')).toBeUndefined();
  });
});
