import { describe, expect, it } from 'vitest';
import { isValidFloorPlan, serializeFloorPlan } from './floorPlanGeometry';
import {
  UCHICAGO_DORMS,
  buildUChicagoDormStarters,
  templatesForUChicagoDorm,
  uChicagoLayoutLabel,
} from './uchicagoDormTemplates';

describe('uchicagoDormTemplates', () => {
  it('defines seven residence halls with the expected layout options', () => {
    expect(UCHICAGO_DORMS).toHaveLength(7);
    expect(UCHICAGO_DORMS.find((d) => d.id === 'woodlawn')?.layouts).toEqual(['single', 'double']);
    expect(UCHICAGO_DORMS.find((d) => d.id === 'north')?.layouts).toEqual(['single', 'double']);
    expect(UCHICAGO_DORMS.find((d) => d.id === 'max-p')?.layouts).toEqual(['single', 'double']);
    expect(UCHICAGO_DORMS.find((d) => d.id === 'burton-judson')?.layouts).toEqual([
      'single',
      'double',
      'pass-through',
    ]);
  });

  it('builds one blank starter per dorm × layout pair', () => {
    const starters = buildUChicagoDormStarters();
    expect(starters).toHaveLength(15);
    expect(new Set(starters.map((s) => s.id)).size).toBe(15);
    for (const starter of starters) {
      expect(starter.goal).toBe('uchicago');
      expect(starter.floorItems).toHaveLength(0);
      expect(isValidFloorPlan(serializeFloorPlan(starter.buildPlan())), starter.id).toBe(true);
    }
  });

  it('filters templates by residence hall', () => {
    const starters = buildUChicagoDormStarters();
    const woodlawn = templatesForUChicagoDorm(starters, 'woodlawn');
    expect(woodlawn).toHaveLength(2);
    expect(woodlawn.map((t) => t.dormMeta?.layout).sort()).toEqual(['double', 'single']);
  });

  it('labels layout types for the picker', () => {
    expect(uChicagoLayoutLabel('single')).toBe('Single');
    expect(uChicagoLayoutLabel('pass-through')).toBe('BJ pass through');
  });

  it('gives BJ pass-through starters doors on opposite walls', () => {
    const starters = buildUChicagoDormStarters();
    const passThrough = starters.find((s) => s.id === 'uchicago-burton-judson-pass-through');
    expect(passThrough).toBeDefined();
    const plan = passThrough!.buildPlan();
    const doors = plan.openings.filter((o) => o.kind === 'door');
    expect(doors).toHaveLength(2);
    expect(new Set(doors.map((d) => d.wallId)).size).toBe(2);
  });

  it('uses charcoal carpet for Woodlawn starters', () => {
    const starters = buildUChicagoDormStarters();
    for (const starter of starters.filter((s) => s.dormMeta?.dormId === 'woodlawn')) {
      expect(starter.buildEnvironment().appearance.floorPreset, starter.id).toBe('charcoalCarpet');
    }
    expect(
      starters.find((s) => s.dormMeta?.dormId === 'north')?.buildEnvironment().appearance.floorPreset,
    ).toBe('lightOak');
  });
});
