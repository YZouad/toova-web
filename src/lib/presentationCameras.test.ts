import { describe, expect, it } from 'vitest';
import { setZoneTag, type FloorPlan } from './floorPlanGeometry';
import { resolveApartmentRooms } from './apartmentRooms';
import { DEFAULT_ROOM_GEOMETRY } from './roomGeometry';
import { dollhouseFraming, framingForArea, framingForPreset } from './presentationCameras';

function partitionedPlan(): FloorPlan {
  return {
    version: 2,
    height: 96,
    vertices: [
      { id: 'v0', x: 0, z: 0 },
      { id: 'v1', x: 60, z: 0 },
      { id: 'v2', x: 120, z: 0 },
      { id: 'v3', x: 120, z: 120 },
      { id: 'v4', x: 60, z: 120 },
      { id: 'v5', x: 0, z: 120 },
    ],
    walls: [
      { id: 'w0', startId: 'v0', endId: 'v1' },
      { id: 'w1', startId: 'v1', endId: 'v2' },
      { id: 'w2', startId: 'v2', endId: 'v3' },
      { id: 'w3', startId: 'v3', endId: 'v4' },
      { id: 'w4', startId: 'v4', endId: 'v5' },
      { id: 'w5', startId: 'v5', endId: 'v0' },
      { id: 'w6', startId: 'v1', endId: 'v4' },
    ],
    openings: [
      { id: 'd0', wallId: 'w2', kind: 'door', offset: 44, width: 32, height: 80, hinge: 'left' },
    ],
  };
}

describe('presentationCameras apartment framing', () => {
  it('framingForArea fits the focused face tighter than the whole plan', () => {
    const plan = setZoneTag(setZoneTag(partitionedPlan(), 30, 60, 'bedroom'), 90, 60, 'kitchen');
    const bedroom = resolveApartmentRooms(plan).find((r) => r.tag === 'bedroom')!;
    const whole = framingForPreset(plan, 'corner');
    const area = framingForArea(plan, bedroom, 'corner');
    // Target should sit near the bedroom, not the apartment center.
    expect(area.target[0]).toBeLessThan(60);
    expect(whole.target[0]).toBeGreaterThan(area.target[0] - 1);
  });

  it('dollhouseFraming looks down on the full plan', () => {
    const f = dollhouseFraming(DEFAULT_ROOM_GEOMETRY);
    expect(f.position[1]).toBeGreaterThan(DEFAULT_ROOM_GEOMETRY.height);
    expect(f.target[1]).toBeLessThan(f.position[1]);
  });

  it('dollhouseFraming keeps plan corners inside the view frustum', () => {
    const plan = setZoneTag(setZoneTag(partitionedPlan(), 30, 60, 'bedroom'), 90, 60, 'kitchen');
    const f = dollhouseFraming(plan);
    const b = {
      minX: 0,
      maxX: 120,
      minZ: 0,
      maxZ: 120,
    };
    const corners: [number, number, number][] = [
      [b.minX, 0, b.minZ],
      [b.maxX, 0, b.minZ],
      [b.minX, 0, b.maxZ],
      [b.maxX, 0, b.maxZ],
    ];
    const fovRad = ((f.fov ?? 42) * Math.PI) / 180;
    const forward = [
      f.target[0] - f.position[0],
      f.target[1] - f.position[1],
      f.target[2] - f.position[2],
    ] as [number, number, number];
    const fLen = Math.hypot(...forward) || 1;
    const fx = forward[0] / fLen;
    const fy = forward[1] / fLen;
    const fz = forward[2] / fLen;
    // Build a camera-right from world up × forward.
    let rx = 0 * fz - 1 * fy;
    let ry = 1 * fx - 0 * fz;
    let rz = 0 * fy - 0 * fx;
    const rLen = Math.hypot(rx, ry, rz) || 1;
    rx /= rLen;
    ry /= rLen;
    rz /= rLen;
    const ux = fy * rz - fz * ry;
    const uy = fz * rx - fx * rz;
    const uz = fx * ry - fy * rx;
    for (const [x, y, z] of corners) {
      const dx = x - f.position[0];
      const dy = y - f.position[1];
      const dz = z - f.position[2];
      const depth = dx * fx + dy * fy + dz * fz;
      expect(depth).toBeGreaterThan(0);
      const ndcX = (dx * rx + dy * ry + dz * rz) / (depth * Math.tan(fovRad / 2));
      const ndcY = (dx * ux + dy * uy + dz * uz) / (depth * Math.tan(fovRad / 2));
      expect(Math.abs(ndcX)).toBeLessThan(0.9);
      expect(Math.abs(ndcY)).toBeLessThan(0.9);
    }
  });
});
