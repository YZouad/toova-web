import { describe, expect, it } from 'vitest';
import type { FloorPlan } from '../lib/floorPlanGeometry';
import {
  allWallSegments,
  lShapePlan,
  rectanglePlan,
} from '../lib/floorPlanGeometry';
import { ROOM } from '../units';
import {
  convexOverlapArea,
  localSpanForTrim,
  polygonArea,
  spansMinusDoors,
  wallEndTrims,
  wallFootprint,
  wallLocalToWorld,
} from './wallJoins';

const T = ROOM.wallThickness;

function unionStats(plan: FloorPlan) {
  const segs = allWallSegments(plan);
  const trims = wallEndTrims(segs, T);
  const quads = segs.map((seg, i) => wallFootprint(seg, trims[i]!, T));
  let area = 0;
  let overlap = 0;
  for (const q of quads) area += Math.abs(polygonArea(q));
  for (let i = 0; i < quads.length; i++) {
    for (let j = i + 1; j < quads.length; j++) {
      overlap += convexOverlapArea(quads[i]!, quads[j]!);
    }
  }
  return { segs, trims, quads, area, overlap };
}

function pointInConvex(x: number, z: number, poly: [number, number][]): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const cross = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (cross < -0.05) return false;
  }
  return true;
}

describe('wallEndTrims', () => {
  it('butts a rectangle so slabs meet without crossing', () => {
    const W = 120;
    const D = 96;
    const stats = unionStats(rectanglePlan(W, D, 96, false));
    expect(stats.overlap).toBeLessThan(1);
    expect(stats.area).toBeCloseTo(T * 2 * (W + D), 0);
    for (const [seg, quad] of stats.segs.map((seg, i) => [seg, stats.quads[i]!] as const)) {
      const mx = (seg.start.x + seg.end.x) / 2;
      const mz = (seg.start.z + seg.end.z) / 2;
      expect(pointInConvex(mx, mz, quad)).toBe(true);
    }
    // Outer corner is solid; the room center is not a wall.
    expect(stats.quads.some((q) => pointInConvex(-T / 2 + 0.2, 0, q))).toBe(true);
    expect(stats.quads.some((q) => pointInConvex(W / 2, D / 2, q))).toBe(false);
  });

  it('keeps an L and a diagonal room from crossing at corners', () => {
    const lPlan = lShapePlan(120, 120, 48, 48, 96);
    const lStats = unionStats(lPlan);
    const perimeter = lStats.segs.reduce((sum, seg) => sum + seg.length, 0);
    expect(lStats.overlap).toBeLessThan(1);
    expect(lStats.area).toBeCloseTo(T * perimeter, 0);

    const stats = unionStats(trianglePlan());
    expect(stats.overlap).toBeLessThan(1);
    for (const [seg, quad] of stats.segs.map((seg, i) => [seg, stats.quads[i]!] as const)) {
      const mx = (seg.start.x + seg.end.x) / 2;
      const mz = (seg.start.z + seg.end.z) / 2;
      expect(pointInConvex(mx, mz, quad)).toBe(true);
    }
  });

  it('stops a stem at the through-wall face', () => {
    const plan: FloorPlan = {
      version: 2,
      height: 96,
      vertices: [
        { id: 'a', x: 0, z: 0 },
        { id: 'b', x: 60, z: 0 },
        { id: 'c', x: 120, z: 0 },
        { id: 'd', x: 60, z: 80 },
      ],
      walls: [
        { id: 'w0', startId: 'a', endId: 'b' },
        { id: 'w1', startId: 'b', endId: 'c' },
        { id: 'w2', startId: 'b', endId: 'd' },
      ],
      openings: [],
    };
    const stats = unionStats(plan);
    expect(stats.overlap).toBeLessThan(1);
    const h = T / 2;
    // Seam of the two through-halves is shared; a point beside it belongs to one slab.
    expect(stats.quads.filter((q) => pointInConvex(30, 0, q)).length).toBe(1);
    expect(stats.quads.filter((q) => pointInConvex(90, 0, q)).length).toBe(1);
    // Stem starts on the through-wall face and does not poke out the back.
    expect(stats.quads.filter((q) => pointInConvex(60, h + 1, q)).length).toBe(1);
    expect(stats.quads.some((q) => pointInConvex(60, -h - 1, q))).toBe(false);
  });

  it('maps the local span onto the same footprint the mesh uses', () => {
    const plan = rectanglePlan(120, 96, 96, false);
    const segs = allWallSegments(plan);
    const trims = wallEndTrims(segs, T);
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      const span = localSpanForTrim(seg, trims[i]!);
      const fromLocal = [
        wallLocalToWorld(seg, span.x0, 0),
        wallLocalToWorld(seg, span.x1, 0),
        wallLocalToWorld(seg, span.x1, T),
        wallLocalToWorld(seg, span.x0, T),
      ];
      const footprint = wallFootprint(seg, trims[i]!, T);
      for (const p of fromLocal) {
        expect(footprint.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05)).toBe(true);
      }
    }
  });

  it('cuts door gaps out of the cap span', () => {
    const spans = spansMinusDoors(-50, 50, [{ x: 0, w: 32 }]);
    expect(spans).toEqual([
      [-50, -16],
      [16, 50],
    ]);
    expect(spansMinusDoors(-10, 10, [{ x: 0, w: 32 }])).toEqual([]);
  });
});

function trianglePlan(): FloorPlan {
  return {
    version: 2,
    height: 96,
    vertices: [
      { id: 'a', x: 0, z: 0 },
      { id: 'b', x: 120, z: 0 },
      { id: 'c', x: 60, z: 90 },
    ],
    walls: [
      { id: 'w0', startId: 'a', endId: 'b' },
      { id: 'w1', startId: 'b', endId: 'c' },
      { id: 'w2', startId: 'c', endId: 'a' },
    ],
    openings: [],
  };
}
