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
});
