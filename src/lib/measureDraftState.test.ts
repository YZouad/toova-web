import { describe, expect, it } from 'vitest';
import { rectanglePlan } from './floorPlanGeometry';
import {
  clampMeasurePoint,
  defaultMeasureHeight,
  MEASURE_POINT_OFFSET_IN,
  setMeasureActiveEndpoint,
  setMeasureEndpoint,
  spawnMeasureDraft,
} from './measureDraftState';

describe('spawnMeasureDraft', () => {
  it('spawns two points at room centroid with B offset on X', () => {
    const room = rectanglePlan(120, 180);
    const draft = spawnMeasureDraft(room, null);
    expect(draft.a[1]).toBe(draft.b[1]);
    expect(draft.b[0] - draft.a[0]).toBe(MEASURE_POINT_OFFSET_IN);
    expect(draft.activeEndpoint).toBe('a');
    expect(draft.draggingEndpoint).toBeNull();
    expect(draft.importAccept).toBe(false);
  });

  it('records import accept mode when requested', () => {
    const room = rectanglePlan(120, 180);
    const draft = spawnMeasureDraft(room, null, true);
    expect(draft.importAccept).toBe(true);
  });

  it('uses the same default height as free lights', () => {
    const room = rectanglePlan(120, 180, 96);
    const draft = spawnMeasureDraft(room, 'depth');
    expect(draft.a[1]).toBe(defaultMeasureHeight(room));
    expect(draft.acceptField).toBe('depth');
  });
});

describe('clampMeasurePoint', () => {
  it('keeps points inside room bounds and height', () => {
    const room = rectanglePlan(120, 180, 96);
    const clamped = clampMeasurePoint([-100, -5, 999], room);
    expect(clamped[0]).toBeGreaterThanOrEqual(6);
    expect(clamped[2]).toBeLessThanOrEqual(174);
    expect(clamped[1]).toBe(0);
  });
});

describe('setMeasureEndpoint', () => {
  it('updates XZ while preserving Y when only horizontal coords change', () => {
    const room = rectanglePlan(120, 180);
    let draft = spawnMeasureDraft(room, null);
    draft = setMeasureEndpoint(draft, 'a', [40, draft.a[1], 50], room);
    expect(draft.a[0]).toBe(40);
    expect(draft.a[2]).toBe(50);
  });

  it('updates height independently', () => {
    const room = rectanglePlan(120, 180, 96);
    let draft = spawnMeasureDraft(room, null);
    draft = setMeasureEndpoint(draft, 'b', [draft.b[0], 72, draft.b[2]], room);
    expect(draft.b[1]).toBe(72);
  });
});

describe('setMeasureActiveEndpoint', () => {
  it('selects an endpoint unless dragging', () => {
    const room = rectanglePlan(120, 120);
    let draft = spawnMeasureDraft(room, null);
    draft = setMeasureActiveEndpoint(draft, 'b');
    expect(draft.activeEndpoint).toBe('b');
    draft = { ...draft, draggingEndpoint: 'a' };
    expect(setMeasureActiveEndpoint(draft, 'a').activeEndpoint).toBe('b');
  });
});
