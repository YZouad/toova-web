import { describe, expect, it } from 'vitest';
import {
  chartMax,
  chartYTicks,
  formatDelta,
  pickTickIndexes,
  polylinePoints,
  shouldLabelPoint,
} from './chartMath';

describe('chartMath', () => {
  it('nices empty and zero series to a usable max', () => {
    expect(chartMax([])).toBe(1);
    expect(chartMax([0, 0])).toBe(1);
    expect(chartMax([3, 9, 1])).toBe(9);
  });

  it('builds a polyline that stays inside the viewBox', () => {
    const pts = polylinePoints(
      [
        { t: 'a', v: 0 },
        { t: 'b', v: 10 },
      ],
      100,
      50,
      0,
    );
    expect(pts).toBe('0.0,50.0 100.0,0.0');
  });

  it('formats missing deltas as an em dash', () => {
    expect(formatDelta(null)).toBe('—');
    expect(formatDelta(12.5)).toBe('+12.5%');
  });

  it('emits inclusive y-axis ticks from 0 to the nicened max', () => {
    expect(chartYTicks(6, 3)).toEqual([0, 3, 6]);
    expect(chartYTicks(0, 3)[0]).toBe(0);
    expect(chartYTicks(0, 3)[chartYTicks(0, 3).length - 1]).toBe(1);
  });

  it('always includes first and last x indexes', () => {
    expect(pickTickIndexes(1)).toEqual([0]);
    expect(pickTickIndexes(4, 5)).toEqual([0, 1, 2, 3]);
    const ticks = pickTickIndexes(30, 5);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(29);
    expect(ticks).toHaveLength(5);
  });

  it('labels peaks and the last point on dense series', () => {
    const points = [0, 1, 2, 5, 2, 1, 0, 1, 0, 0, 0, 1].map((v, i) => ({ t: String(i), v }));
    expect(shouldLabelPoint(points, 3)).toBe(true);
    expect(shouldLabelPoint(points, 2)).toBe(false);
    expect(shouldLabelPoint(points, 11)).toBe(true);
  });
});
