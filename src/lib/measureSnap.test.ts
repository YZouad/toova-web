import { describe, expect, it } from 'vitest';
import type { Item } from '../store';
import { rectanglePlan } from './floorPlanGeometry';
import type { MeasureHit } from './measurePick';
import {
  applyMeasureSnap,
  collectSnapCandidates,
  itemBboxCorners,
  itemFaceCenters,
} from './measureSnap';
import * as THREE from 'three';

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'desk-1',
    kind: 'desk',
    position: [60, 0, 60],
    rotationY: 0,
    size: [48, 30, 24],
    label: 'Desk',
    attachmentKey: 'att-1',
    ...overrides,
  };
}

describe('itemBboxCorners', () => {
  it('returns 8 corners for an unrotated item', () => {
    const corners = itemBboxCorners(makeItem());
    expect(corners).toHaveLength(8);
    expect(corners).toContainEqual([36, 0, 48]);
    expect(corners).toContainEqual([84, 30, 72]);
  });
});

describe('itemFaceCenters', () => {
  it('includes top, bottom, and four side centers', () => {
    const centers = itemFaceCenters(makeItem());
    expect(centers).toHaveLength(6);
    expect(centers).toContainEqual([60, 0, 60]);
    expect(centers).toContainEqual([60, 30, 60]);
  });
});

describe('collectSnapCandidates', () => {
  const room = rectanglePlan(120, 180);

  it('adds wall endpoints for a wall hit', () => {
    const walls = room.walls;
    const wallId = walls[0]!.id;
    const hit: MeasureHit = {
      point: [60, 40, 0],
      normal: [0, 0, 1],
      wallId,
      itemId: null,
    };
    const candidates = collectSnapCandidates(hit, room, {});
    expect(candidates.some((c) => c.kind === 'corner')).toBe(true);
    expect(candidates.some((c) => c.kind === 'wall')).toBe(true);
  });

  it('adds furniture corners for an item hit', () => {
    const item = makeItem();
    const hit: MeasureHit = {
      point: [60, 15, 48],
      normal: [0, 0, -1],
      wallId: null,
      itemId: item.id,
    };
    const candidates = collectSnapCandidates(hit, room, { [item.id]: item });
    expect(candidates.filter((c) => c.kind === 'corner').length).toBeGreaterThanOrEqual(8);
    expect(candidates.some((c) => c.kind === 'edge')).toBe(true);
  });

  it('adds room corners and grid for a floor hit', () => {
    const hit: MeasureHit = {
      point: [40, 0.1, 50],
      normal: [0, 1, 0],
      wallId: null,
      itemId: null,
    };
    const candidates = collectSnapCandidates(hit, room, {});
    expect(candidates.some((c) => c.kind === 'corner')).toBe(true);
    expect(candidates.some((c) => c.kind === 'grid')).toBe(true);
  });
});

describe('applyMeasureSnap', () => {
  it('snaps to a nearby corner within the screen threshold', () => {
    const room = rectanglePlan(120, 180);
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);
    camera.position.set(60, 80, 200);
    camera.lookAt(60, 40, 90);
    camera.updateMatrixWorld();

    const hit: MeasureHit = {
      point: [2, 0, 2],
      normal: [0, 1, 0],
      wallId: null,
      itemId: null,
    };
    const rect = {
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;

    const snapped = applyMeasureSnap(hit, room, {}, camera, rect, 80);
    // Near origin corner of the rectangle plan should win when threshold is generous.
    expect(snapped.snapKind).not.toBeNull();
  });
});
