import { describe, expect, it } from 'vitest';
import { rectanglePlan, type FloorPlanBounds } from '../lib/floorPlanGeometry';
import { clampTargetXZ, slideKeepsFooting, wasdKeyFromCode, wasdTranslation } from './wasdPan';

const none = { w: false, a: false, s: false, d: false };

describe('wasdTranslation', () => {
  it('walks forward along the flattened look direction', () => {
    const step = wasdTranslation({ x: 0, y: -0.4, z: -1 }, { x: 0, y: 1, z: 0 }, { ...none, w: true }, 80, 1);
    expect(step).not.toBeNull();
    expect(step!.y).toBe(0);
    expect(step!.x).toBeCloseTo(0);
    expect(step!.z).toBeLessThan(0);
  });

  it('strafes left when facing -Z', () => {
    const step = wasdTranslation({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, { ...none, a: true }, 80, 1);
    expect(step!.x).toBeLessThan(0);
    expect(step!.z).toBeCloseTo(0);
  });

  it('does not move faster on a diagonal', () => {
    const cardinal = wasdTranslation({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, { ...none, w: true }, 80, 0.5);
    const diagonal = wasdTranslation(
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 1, z: 0 },
      { ...none, w: true, d: true },
      80,
      0.5,
    );
    const len = (v: { x: number; z: number }) => Math.hypot(v.x, v.z);
    expect(len(diagonal!)).toBeCloseTo(len(cardinal!));
  });

  it('uses screen-up when the camera looks straight down', () => {
    const step = wasdTranslation({ x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: -1 }, { ...none, w: true }, 200, 1);
    expect(step!.z).toBeLessThan(0);
    expect(step!.x).toBeCloseTo(0);
  });

  it('returns null with no keys or no heading', () => {
    expect(wasdTranslation({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, none, 80, 0.016)).toBeNull();
    expect(wasdTranslation({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, { ...none, w: true }, 80, 0.016)).toBeNull();
  });

  it('maps physical WASD codes', () => {
    expect(wasdKeyFromCode('KeyA')).toBe('a');
    expect(wasdKeyFromCode('KeyE')).toBeNull();
  });
});

describe('clampTargetXZ', () => {
  const bounds: FloorPlanBounds = {
    minX: 0,
    maxX: 200,
    minZ: 0,
    maxZ: 100,
    width: 200,
    depth: 100,
  };

  it('leaves an in-plan target where it is', () => {
    expect(clampTargetXZ(40, 40, bounds)).toEqual({ x: 40, z: 40 });
  });

  it('stops a target that has left the plan', () => {
    const clamped = clampTargetXZ(10_000, -10_000, bounds);
    expect(clamped.x).toBeLessThan(1000);
    expect(clamped.z).toBeGreaterThan(-1000);
  });
});

describe('slideKeepsFooting', () => {
  const plan = rectanglePlan(120, 144, 96, true);

  it('walks across the middle of the room', () => {
    expect(slideKeepsFooting(60, 70, 0, 8, plan)).toEqual({ dx: 0, dz: 8 });
  });

  it('stops at a solid wall and still slides along it', () => {
    const slide = slideKeepsFooting(20, 12, -8, -8, plan);
    expect(slide.dz).toBe(0);
    expect(slide.dx).toBe(-8);
  });

  it('passes through a door', () => {
    const slide = slideKeepsFooting(60, 16, 0, -12, plan);
    expect(slide.dz).toBe(-12);
  });

  it('does not pass through a window', () => {
    const slide = slideKeepsFooting(60, 132, 0, 12, plan);
    expect(slide.dz).toBe(0);
  });
});
