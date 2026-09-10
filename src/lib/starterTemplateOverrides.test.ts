import { describe, expect, it } from 'vitest';
import { getRoomStarterTemplate, ROOM_STARTER_TEMPLATES } from './roomStarterTemplates';
import {
  applyStarterOverride,
  mergeStarterTemplates,
  parseStarterOverride,
} from './starterTemplateOverrides';

describe('starterTemplateOverrides', () => {
  it('parses a furniture + copy override and ignores junk', () => {
    const parsed = parseStarterOverride({
      label: '  Cozy twin  ',
      hidden: true,
      timeOfDay: 21,
      appearance: { wallColor: '#6b7f6a', floorPreset: 'carpet', recessedLights: false },
      floorItems: [
        { kind: 'bed', position: [20, 0, 80], rotationY: 0 },
        { kind: 'imported', position: [1, 0, 1], rotationY: 0 },
        { kind: 'lamp', position: 'nope' },
      ],
      hanging: [{ kind: 'lights', wallIndex: 0, offsetStart: 10, offsetEnd: 40, height: 72 }],
    });
    expect(parsed.label).toBe('Cozy twin');
    expect(parsed.hidden).toBe(true);
    expect(parsed.appearance?.floorPreset).toBe('carpet');
    expect(parsed.floorItems).toHaveLength(1);
    expect(parsed.floorItems?.[0]?.kind).toBe('bed');
    expect(parsed.hanging).toHaveLength(1);
  });

  it('applies overrides on top of a builtin without changing its plan', () => {
    const base = getRoomStarterTemplate('bedroom-simple')!;
    const next = applyStarterOverride(base, {
      label: 'Edited bedroom',
      timeOfDay: 8,
      appearance: { wallColor: '#3a3a3a' },
      floorItems: [{ kind: 'chair', position: [40, 0, 40], rotationY: 1.5 }],
    });
    expect(next.label).toBe('Edited bedroom');
    expect(next.floorItems).toHaveLength(1);
    expect(next.buildPlan().walls.length).toBe(base.buildPlan().walls.length);
    expect(next.buildEnvironment().timeOfDay).toBe(8);
    expect(next.buildEnvironment().appearance.wallColor).toBe('#3a3a3a');
    expect(base.label).toBe('Simple bedroom');
  });

  it('merges by id and marks hidden templates', () => {
    const merged = mergeStarterTemplates(ROOM_STARTER_TEMPLATES, {
      'office-simple': { hidden: true, label: 'Hidden office' },
    });
    const office = merged.find((t) => t.id === 'office-simple');
    expect(office?.hidden).toBe(true);
    expect(office?.label).toBe('Hidden office');
    expect(merged).toHaveLength(ROOM_STARTER_TEMPLATES.length);
  });
});
