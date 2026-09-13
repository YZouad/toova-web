import { describe, expect, it } from 'vitest';
import {
  formatItemDimensions,
  itemDimLabelAnchor,
  WALL_DIM_FLOOR_Y,
  WALL_DIM_INSET,
  wallDimGeometry,
} from './dimensionOverlay';
import { allWallSegments, formatLength, rectanglePlan } from './floorPlanGeometry';

describe('wallDimGeometry', () => {
  it('builds extension lines offset into the room for a rectangle wall', () => {
    const plan = rectanglePlan(120, 96, 96, false);
    const segments = allWallSegments(plan);
    expect(segments.length).toBe(4);

    const seg = segments[0]!;
    const geom = wallDimGeometry(seg);

    expect(geom.wallId).toBe(seg.wall.id);
    expect(geom.labelText).toBe(formatLength(seg.length, 'ft-in'));
    expect(geom.startExtension[0][1]).toBe(WALL_DIM_FLOOR_Y);
    expect(geom.dimLine[0][1]).toBe(WALL_DIM_FLOOR_Y);

    const innerStart = geom.startExtension[0];
    const dimStart = geom.startExtension[1];
    const insetDist = Math.hypot(dimStart[0] - innerStart[0], dimStart[2] - innerStart[2]);
    expect(Math.round(insetDist)).toBe(WALL_DIM_INSET);

    const dimLen = Math.hypot(
      geom.dimLine[1][0] - geom.dimLine[0][0],
      geom.dimLine[1][2] - geom.dimLine[0][2],
    );
    expect(Math.round(dimLen)).toBe(Math.round(seg.length));
  });
});

describe('formatItemDimensions', () => {
  it('formats width × depth × height in inches', () => {
    expect(formatItemDimensions([48, 30, 24])).toBe('48×24×30″');
  });
});

describe('itemDimLabelAnchor', () => {
  it('sits above the item top', () => {
    const anchor = itemDimLabelAnchor({
      position: [10, 0, 20],
      size: [48, 30, 24],
    });
    expect(anchor[0]).toBe(10);
    expect(anchor[2]).toBe(20);
    expect(anchor[1]).toBeGreaterThan(30);
  });
});
