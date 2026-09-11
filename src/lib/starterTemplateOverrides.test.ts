import { describe, expect, it } from 'vitest';
import { getRoomStarterTemplate, materializeStarterItems, ROOM_STARTER_TEMPLATES } from './roomStarterTemplates';
import {
  applyStarterOverride,
  hangingSeedFromItem,
  isStarterEditWorkspaceId,
  mergeStarterTemplates,
  overrideFromDesignerState,
  parseStarterOverride,
  starterEditWorkspaceId,
  templateIdFromStarterEditWorkspace,
} from './starterTemplateOverrides';
import { DEFAULT_ENVIRONMENT, newAttachmentKey, type Item } from '../store';

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

  it('parses designer snapshots and a frozen plan', () => {
    const base = getRoomStarterTemplate('bedroom-simple')!;
    const plan = base.buildPlan();
    const parsed = parseStarterOverride({
      plan,
      itemSnapshots: [
        {
          id: 'item-1',
          kind: 'chair',
          label: 'Chair',
          position: [40, 0, 40],
          rotationY: 0.5,
          size: [18, 36, 18],
          attachmentKey: 'ak-1',
        },
        {
          id: 'item-2',
          kind: 'hanging',
          label: 'Lights',
          position: [0, 0, 0],
          rotationY: 0,
          size: [12, 12, 12],
          attachmentKey: 'ak-2',
          hanging: { version: 1 },
        },
      ],
    });
    expect(parsed.plan?.walls.length).toBe(plan.walls.length);
    expect(parsed.itemSnapshots).toHaveLength(1);
    expect(parsed.itemSnapshots?.[0]?.kind).toBe('chair');
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

  it('freezes a designer plan and rematerializes snapshots', () => {
    const base = getRoomStarterTemplate('bedroom-simple')!;
    const plan = base.buildPlan();
    const snapshots: Item[] = [
      {
        id: 'item-1',
        kind: 'desk',
        label: 'Desk',
        position: [30, 0, 40],
        rotationY: 1,
        size: [48, 30, 24],
        attachmentKey: newAttachmentKey(),
      },
    ];
    const next = applyStarterOverride(base, { plan, itemSnapshots: snapshots });
    const rebuilt = next.buildPlan();
    expect(rebuilt.walls.map((w) => w.id)).toEqual(plan.walls.map((w) => w.id));
    const { items } = materializeStarterItems(next, rebuilt);
    expect(items.some((it) => it.kind === 'desk' && it.position[0] === 30)).toBe(true);
  });

  it('captures designer state back into an override', () => {
    const template = getRoomStarterTemplate('bedroom-simple')!;
    const plan = template.buildPlan();
    const { items, order } = materializeStarterItems(template, plan);
    const byId = Object.fromEntries(items.map((it) => [it.id, it]));
    const chair = items.find((it) => it.kind === 'chair') ?? items[0]!;
    byId[chair.id] = { ...chair, position: [55, 0, 62] };
    const payload = overrideFromDesignerState({
      template,
      label: '  Night studio  ',
      items: byId,
      order,
      environment: { ...DEFAULT_ENVIRONMENT, timeOfDay: 21 },
      plan,
    });
    expect(payload.label).toBe('Night studio');
    expect(payload.timeOfDay).toBe(21);
    expect(payload.plan?.walls.length).toBe(plan.walls.length);
    expect(payload.itemSnapshots?.some((it) => it.position[0] === 55)).toBe(true);
    expect(payload.floorItems?.some((s) => s.position[0] === 55)).toBe(true);
    const hangingItem = items.find((it) => it.kind === 'hanging');
    if (hangingItem) {
      expect(hangingSeedFromItem(hangingItem, plan)?.wallIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('parses starter-edit workspace ids', () => {
    expect(starterEditWorkspaceId('bedroom-simple')).toBe('starter-edit-bedroom-simple');
    expect(isStarterEditWorkspaceId('starter-edit-bedroom-simple')).toBe(true);
    expect(isStarterEditWorkspaceId('guest-1')).toBe(false);
    expect(templateIdFromStarterEditWorkspace('starter-edit-bedroom-simple')).toBe('bedroom-simple');
    expect(templateIdFromStarterEditWorkspace('room-abc')).toBeNull();
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
