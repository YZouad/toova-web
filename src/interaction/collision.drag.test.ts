import { describe, expect, it, beforeEach } from 'vitest';
import { FLOOR_PLAN_VERSION, type FloorPlan, lShapePlan, planCentroid, pointInPolygon } from '../lib/floorPlanGeometry';
import { DEFAULT_ROOM_GEOMETRY } from '../lib/roomGeometry';
import { useStore, type Item } from '../store';
import { clampPositionInRoom, clampToRoom, resolveGroupDragDelta, ROOM_INSET } from './collision';

/** 120×120 room whose east wall slants — not 90° to the floor-plan axes. */
function trapezoidPlan(): FloorPlan {
  return {
    version: FLOOR_PLAN_VERSION,
    height: 96,
    vertices: [
      { id: 'v0', x: 0, z: 0 },
      { id: 'v1', x: 120, z: 0 },
      { id: 'v2', x: 72, z: 120 },
      { id: 'v3', x: 0, z: 120 },
    ],
    walls: [
      { id: 'w0', startId: 'v0', endId: 'v1' },
      { id: 'w1', startId: 'v1', endId: 'v2' },
      { id: 'w2', startId: 'v2', endId: 'v3' },
      { id: 'w3', startId: 'v3', endId: 'v0' },
    ],
    openings: [
      {
        id: 'd0',
        wallId: 'w0',
        kind: 'door',
        offset: 44,
        width: 32,
        height: 80,
        hinge: 'left',
      },
    ],
  };
}

function stub(partial: Pick<Item, 'id' | 'kind' | 'position' | 'size'> & Partial<Item>): Item {
  return {
    rotationY: 0,
    label: partial.kind,
    attachmentKey: partial.id,
    ...partial,
  };
}

describe('resolveGroupDragDelta', () => {
  beforeEach(() => {
    useStore.setState({ roomGeometry: structuredClone(DEFAULT_ROOM_GEOMETRY) });
  });

  it('follows the cursor when the path is clear', () => {
    const mover = stub({
      id: 'chair',
      kind: 'chair',
      position: [40, 0, 40],
      size: [10, 10, 10],
    });
    const result = resolveGroupDragDelta(
      [{ item: mover, start: [40, 0, 40] }],
      [],
      8,
      -4,
      0,
      0,
    );
    expect(result).toEqual({ dx: 8, dz: -4, desiredOk: true });
  });

  it('slides along a blocker instead of freezing', () => {
    const mover = stub({
      id: 'chair',
      kind: 'chair',
      position: [40, 0, 40],
      size: [10, 10, 10],
    });
    // Occupies x 65–85, z 35–45 — sitting to the right of the chair.
    const blocker = stub({
      id: 'dresser',
      kind: 'dresser',
      position: [75, 0, 40],
      size: [20, 20, 10],
    });
    // Cursor wants to go through the dresser (+30 X) and a bit forward (+8 Z).
    const result = resolveGroupDragDelta(
      [{ item: mover, start: [40, 0, 40] }],
      [blocker],
      30,
      8,
      0,
      0,
    );
    expect(result.desiredOk).toBe(false);
    // Must not stay frozen at the origin — Z motion along the face is free.
    expect(result.dz).toBeGreaterThan(6);
    // Must not penetrate the dresser (chair half-width 5, dresser starts at 65).
    expect(40 + result.dx + 5).toBeLessThanOrEqual(65.5);
  });

  it('stops at the contact face when dragging straight into another object', () => {
    const mover = stub({
      id: 'chair',
      kind: 'chair',
      position: [40, 0, 40],
      size: [10, 10, 10],
    });
    const blocker = stub({
      id: 'dresser',
      kind: 'dresser',
      position: [75, 0, 40],
      size: [20, 20, 10],
    });
    const result = resolveGroupDragDelta(
      [{ item: mover, start: [40, 0, 40] }],
      [blocker],
      40,
      0,
      0,
      0,
    );
    expect(result.desiredOk).toBe(false);
    expect(result.dz).toBe(0);
    expect(result.dx).toBeGreaterThan(10);
    expect(40 + result.dx + 5).toBeLessThanOrEqual(65.5);
  });

  it('lets an already-overlapping item follow the cursor so it can unstick', () => {
    const mover = stub({
      id: 'chair',
      kind: 'chair',
      position: [50, 0, 40],
      size: [10, 10, 10],
    });
    const blocker = stub({
      id: 'dresser',
      kind: 'dresser',
      position: [50, 0, 40],
      size: [20, 20, 10],
    });
    // +4" is still inside the dresser; without the unstick path this would freeze at 0.
    const result = resolveGroupDragDelta(
      [{ item: mover, start: [50, 0, 40] }],
      [blocker],
      4,
      0,
      0,
      0,
    );
    expect(result.dx).toBe(4);
    expect(result.desiredOk).toBe(false);
  });
});

describe('clampPositionInRoom against a non-square wall', () => {
  const size: [number, number, number] = [12, 12, 12];

  it('stays against the diagonal instead of jumping to the room center', () => {
    const plan = trapezoidPlan();
    const [cx, cz] = planCentroid(plan);
    // Past the slanted east wall at z=60 (centerline is at x=96).
    const [x, , z] = clampPositionInRoom([110, 0, 60], 0, size, plan);

    expect(pointInPolygon(x - 6, z, plan, ROOM_INSET)).toBe(true);
    expect(pointInPolygon(x + 6, z, plan, ROOM_INSET)).toBe(true);
    expect(pointInPolygon(x, z - 6, plan, ROOM_INSET)).toBe(true);
    expect(pointInPolygon(x, z + 6, plan, ROOM_INSET)).toBe(true);
    // Old path walked all the way to the AABB centroid (~60, 60).
    expect(Math.hypot(x - cx, z - cz)).toBeGreaterThan(20);
    expect(x).toBeGreaterThan(75);
    expect(Math.abs(z - 60)).toBeLessThan(16);
  });

  it('pulls an item out of an L-shape notch without teleporting to the room center', () => {
    const plan = lShapePlan(120, 120, 48, 48);
    const [cx, cz] = planCentroid(plan);
    const [x, , z] = clampPositionInRoom([100, 0, 90], 0, size, plan);
    expect(pointInPolygon(x + 6, z, plan, ROOM_INSET)).toBe(true);
    expect(pointInPolygon(x, z + 6, plan, ROOM_INSET)).toBe(true);
    // Stay near the notch walls, not the AABB midpoint.
    expect(Math.hypot(x - cx, z - cz)).toBeGreaterThan(15);
  });

  it('lets a drag slide along the slanted wall instead of snapping back to the start', () => {
    const plan = trapezoidPlan();
    useStore.setState({ roomGeometry: plan });

    const start: [number, number, number] = [50, 0, 40];
    const item = stub({
      id: 'chair',
      kind: 'chair',
      position: start,
      size,
    });

    // Cursor is through the diagonal and further south — should rest on the
    // wall near z=90, not teleport back to the drag origin.
    const [pcx, pcz] = clampToRoom(item, 110, 90);
    const { dx, dz } = resolveGroupDragDelta(
      [{ item, start }],
      [],
      pcx - start[0],
      pcz - start[2],
      0,
      0,
    );
    const [x, z] = clampToRoom(item, start[0] + dx, start[2] + dz);

    expect(Math.hypot(x - start[0], z - start[2])).toBeGreaterThan(20);
    expect(z).toBeGreaterThan(70);
    expect(pointInPolygon(x + 6, z, plan, ROOM_INSET)).toBe(true);
  });
});
