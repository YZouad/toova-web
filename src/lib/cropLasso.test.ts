import { describe, expect, it } from 'vitest';
import {
  appendLassoPoint,
  clampNaturalPoint,
  finalizeLassoPath,
  lassoSampleDistance,
  simplifyPolyline,
} from './cropLasso';

describe('clampNaturalPoint', () => {
  it('clamps to the image bounds', () => {
    expect(clampNaturalPoint({ x: -4, y: 80 }, 100, 50)).toEqual({ x: 0, y: 49 });
    expect(clampNaturalPoint({ x: 140, y: -2 }, 100, 50)).toEqual({ x: 99, y: 0 });
  });
});

describe('appendLassoPoint', () => {
  it('adds the first point', () => {
    expect(appendLassoPoint([], { x: 3, y: 4 }, 2)).toEqual([{ x: 3, y: 4 }]);
  });

  it('skips samples closer than the minimum distance', () => {
    const start = [{ x: 0, y: 0 }];
    expect(appendLassoPoint(start, { x: 1, y: 0 }, 2)).toBe(start);
    expect(appendLassoPoint(start, { x: 3, y: 0 }, 2)).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
  });
});

describe('lassoSampleDistance', () => {
  it('scales with natural-to-display ratio', () => {
    expect(lassoSampleDistance(1600, 400)).toBe(8);
    expect(lassoSampleDistance(100, 400)).toBe(2);
  });
});

describe('simplifyPolyline', () => {
  it('keeps endpoints of a straight line', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 0.2 },
      { x: 10, y: 0 },
    ];
    expect(simplifyPolyline(points, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it('keeps a corner that exceeds epsilon', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ];
    expect(simplifyPolyline(points, 1)).toEqual(points);
  });
});

describe('finalizeLassoPath', () => {
  it('returns null for fewer than three points', () => {
    expect(finalizeLassoPath([{ x: 0, y: 0 }, { x: 4, y: 0 }], 1)).toBeNull();
  });

  it('drops a duplicate closing sample', () => {
    const path = finalizeLassoPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0.2, y: 0.1 },
      ],
      1,
    );
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });
});
