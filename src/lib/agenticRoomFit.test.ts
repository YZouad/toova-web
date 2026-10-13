import { describe, expect, it } from 'vitest';
import { rectanglePlan } from './floorPlanGeometry';
import { clampAgenticPieceSize, enrichBuildDimensionsForRoom } from './agenticRoomFit';

describe('agenticRoomFit', () => {
  it('clamps oversized dresser to room footprint', () => {
    const plan = rectanglePlan(96, 96, 96);
    const size = clampAgenticPieceSize(plan, 'dresser', [60, 40, 24]);
    expect(size[0]).toBeLessThanOrEqual(50);
    expect(size[2]).toBeLessThanOrEqual(46);
  });

  it('fills dresser inch dims from drawer grid for small rooms', () => {
    const plan = rectanglePlan(96, 108, 96);
    const build = enrichBuildDimensionsForRoom(
      plan,
      'dresser',
      { drawerRows: 4, drawerColumns: 1 },
      'compact dresser',
    );
    expect(build?.widthIn).toBeDefined();
    expect(build!.widthIn!).toBeLessThanOrEqual(50);
    expect(build?.heightIn).toBeGreaterThan(20);
  });
});
