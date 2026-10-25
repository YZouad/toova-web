import { describe, expect, it } from 'vitest';
import { rectanglePlan } from './floorPlanGeometry';
import {
  applyWindowCurtainsToPlan,
  inferWindowCurtainsFromItems,
  isWindowCurtainProductQuery,
  parseAgentWindowCurtains,
  resolveAgentWindowCurtains,
} from './agenticRoomWindowDressing';

describe('agenticRoomWindowDressing', () => {
  it('detects curtain shopping queries', () => {
    expect(isWindowCurtainProductQuery('blackout curtains')).toBe(true);
    expect(isWindowCurtainProductQuery('queen bed frame')).toBe(false);
  });

  it('parses agent windowCurtains payload', () => {
    expect(parseAgentWindowCurtains({ enabled: false })).toBeNull();
    expect(parseAgentWindowCurtains({ enabled: true, color: '#39475e', openness: 0.2 })).toEqual({
      color: '#39475e',
      openness: 0.2,
    });
  });

  it('infers curtains from checklist lines', () => {
    const curtains = inferWindowCurtainsFromItems(
      [{ query: 'blackout curtains', qty: 1 }],
      'gothic',
    );
    expect(curtains?.openness).toBeLessThan(0.2);
    expect(curtains?.color).toMatch(/^#/);
  });

  it('applies curtains to every window opening', () => {
    const plan = rectanglePlan(120, 120, 96);
    const dressed = applyWindowCurtainsToPlan(plan, { color: '#87917b', openness: 0.5 });
    for (const o of dressed.openings.filter((op) => op.kind === 'window')) {
      expect(o.curtains).toEqual({ color: '#87917b', openness: 0.5 });
    }
  });

  it('prefers explicit windowCurtains over inference', () => {
    const resolved = resolveAgentWindowCurtains({
      windowCurtains: { color: '#eee8dc', openness: 0.9 },
      items: [{ query: 'blackout curtains', qty: 1 }],
      theme: 'coastal',
    });
    expect(resolved).toEqual({ color: '#eee8dc', openness: 0.9 });
  });
});
