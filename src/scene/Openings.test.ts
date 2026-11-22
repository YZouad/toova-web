import { describe, expect, it } from 'vitest';
import { ROOM } from '../units';
import { doorPartBoxes } from './Openings';

const T = ROOM.wallThickness;

describe('doorPartBoxes', () => {
  it('keeps every part inside the wall thickness band', () => {
    for (const hinge of ['left', 'right'] as const) {
      for (const closed of [true, false]) {
        const { boxes, hinge: pivot } = doorPartBoxes(32, 80, T, hinge, closed);
        const zLo = -T - 0.2;
        const zHi = 0.2;
        for (const box of boxes) {
          // Leaf/panel/handle are relative to the hinge group, which sits at zMid.
          const z =
            box.kind === 'leaf' || box.kind === 'panel' || box.kind === 'handle'
              ? pivot[2] + box.center[2]
              : box.center[2];
          const halfZ =
            box.kind === 'leaf' || box.kind === 'panel' || box.kind === 'handle'
              ? box.size[2] / 2
              : box.size[2] / 2;
          expect(z - halfZ).toBeGreaterThanOrEqual(zLo - 1e-6);
          expect(z + halfZ).toBeLessThanOrEqual(zHi + 1e-6);
        }
      }
    }
  });

  it('keeps the threshold above the floor', () => {
    const { boxes } = doorPartBoxes(32, 80, T, 'right', true);
    const threshold = boxes.find((b) => b.kind === 'threshold')!;
    const bottom = threshold.center[1] - threshold.size[1] / 2;
    expect(bottom).toBeGreaterThanOrEqual(0);
    expect(threshold.center[2]).toBeCloseTo(-T / 2, 5);
    expect(threshold.size[2]).toBeCloseTo(T, 5);
  });

  it('centers jambs in the wall with a slight proud face', () => {
    const { boxes } = doorPartBoxes(32, 80, T, 'right', true);
    for (const kind of ['leftJamb', 'rightJamb', 'head'] as const) {
      const box = boxes.find((b) => b.kind === kind)!;
      expect(box.center[2]).toBeCloseTo(-T / 2, 5);
      expect(box.size[2]).toBeCloseTo(T + 0.2, 5);
    }
  });
});
