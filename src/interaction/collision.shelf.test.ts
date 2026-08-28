import { describe, expect, it } from 'vitest';
import { defaultRectanglePlan } from '../lib/floorPlanGeometry';
import { FURNITURE } from '../furniture/registry';
import { DEFAULT_SHELF_ELEVATION, defaultWallShelfPose, itemRect } from './collision';
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
