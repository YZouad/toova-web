import { describe, expect, it } from 'vitest';
import { defaultRectanglePlan } from '../lib/floorPlanGeometry';
import { FURNITURE } from '../furniture/registry';
import {
  DEFAULT_POSTER_CENTER_Y,
  DEFAULT_SHELF_ELEVATION,
  defaultWallPosterPose,
  defaultWallShelfPose,
  itemRect,
} from './collision';
import { isTouchingAnyWall } from '../lib/floorPlanGeometry';

describe('wall shelf placement', () => {
  it('sits at shelf height against a wall, board parallel to the floor', () => {
    const plan = defaultRectanglePlan();
    const size = FURNITURE.shelf.size;
    const pose = defaultWallShelfPose(plan, size);

    expect(pose.position[1]).toBe(DEFAULT_SHELF_ELEVATION);

    const rect = itemRect({
      id: 'shelf',
      kind: 'shelf',
      label: 'Wall Shelf',
      position: pose.position,
      rotationY: pose.rotationY,
      size,
      attachmentKey: 'k',
    });
    expect(isTouchingAnyWall(rect.minX, rect.maxX, rect.minZ, rect.maxZ, plan, 6)).toBe(true);
  });
});

describe('wall poster placement', () => {
  it('hangs near eye level against a wall and steps later posters aside', () => {
    const plan = defaultRectanglePlan();
    const size: [number, number, number] = [24, 36, 0.5];
    const first = defaultWallPosterPose(plan, size, 0);
    const second = defaultWallPosterPose(plan, size, 1);

    expect(first.position[1]).toBeCloseTo(DEFAULT_POSTER_CENTER_Y - size[1] / 2, 5);
    const rect = itemRect({
      id: 'poster',
      kind: 'imported',
      label: 'Poster',
      position: first.position,
      rotationY: first.rotationY,
      size,
      attachmentKey: 'k',
    });
    expect(isTouchingAnyWall(rect.minX, rect.maxX, rect.minZ, rect.maxZ, plan, 6)).toBe(true);
    const shift = Math.hypot(
      second.position[0] - first.position[0],
      second.position[2] - first.position[2],
    );
    expect(shift).toBeGreaterThan(size[0]);
  });
});
