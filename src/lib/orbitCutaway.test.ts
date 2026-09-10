import { describe, expect, it } from 'vitest';
import { allWallSegments, lShapePlan, planCentroid, rectanglePlan } from './floorPlanGeometry';
import { pickOrbitHiddenWallIds, type OrbitWallCandidate } from './orbitCutaway';

function candidatesFrom(plan: ReturnType<typeof rectanglePlan>): OrbitWallCandidate[] {
  return allWallSegments(plan).map((s) => ({
    id: s.wall.id,
    innerFaceCenter: s.innerFaceCenter,
    outward: s.outward,
  }));
}

function centroidOf(plan: ReturnType<typeof rectanglePlan>): { x: number; z: number } {
  const [x, z] = planCentroid(plan);
  return { x, z };
}

describe('pickOrbitHiddenWallIds', () => {
  it('hides two near walls of a rectangle from a corner view', () => {
    const plan = rectanglePlan(120, 120, 96, false);
    const walls = candidatesFrom(plan);
    const centroid = centroidOf(plan);
    const hidden = pickOrbitHiddenWallIds(walls, { x: 200, y: 48, z: 200 }, centroid);

    const hiddenOutwards = walls
      .filter((w) => hidden.has(w.id))
      .map((w) => [Math.round(w.outward[0]), Math.round(w.outward[1])] as const);

    expect(hidden.size).toBeGreaterThanOrEqual(1);
    expect(hiddenOutwards.some(([x, z]) => x > 0 || z > 0)).toBe(true);
    // Far walls (outward -X / -Z) stay visible from the +X+Z corner.
    expect(hiddenOutwards.every(([x, z]) => x >= 0 && z >= 0)).toBe(true);
  });

  it('in an L-shape, hides only the nearer of two same-facing walls', () => {
    const plan = lShapePlan(120, 120, 48, 48);
    const walls = candidatesFrom(plan);
    const centroid = centroidOf(plan);

    const minusZ = walls.filter((w) => w.outward[1] < -0.7);
    expect(minusZ.length).toBeGreaterThanOrEqual(2);

    const southOuter = minusZ.reduce((a, b) => (a.innerFaceCenter[2] < b.innerFaceCenter[2] ? a : b));
    const innerSameFacing = minusZ.reduce((a, b) => (a.innerFaceCenter[2] > b.innerFaceCenter[2] ? a : b));
    expect(southOuter.id).not.toBe(innerSameFacing.id);

    const hidden = pickOrbitHiddenWallIds(
      walls,
      { x: innerSameFacing.innerFaceCenter[0], y: 48, z: -80 },
      centroid,
    );

    expect(hidden.has(southOuter.id)).toBe(true);
    expect(hidden.has(innerSameFacing.id)).toBe(false);
  });
});
