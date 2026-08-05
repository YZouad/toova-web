import { describe, expect, it } from 'vitest';
import {
  buildHangingPath,
  createHangingSeed,
  furnitureLocalFromWorld,
  hangingHasMissingTargets,
  hangingReferencesAttachmentKey,
  leafCountForPath,
  ledSpacingInches,
  mulberry32,
  paletteColorAt,
  parseHangingConfig,
  pathBounds,
  pathLength,
  resolveFurnitureAnchorWorld,
  resolveWallAnchorWorld,
  saggedSpan,
  sampleAlongPath,
  wallAnchorFromWorldHit,
  type FurniturePose,
  type HangingDecorationConfig,
} from './hangingDecorGeometry';
import { defaultRectanglePlan, getWallSegment } from './floorPlanGeometry';

describe('hangingDecorGeometry', () => {
  const plan = defaultRectanglePlan();
  const wall = plan.walls[0]!;
  const seg = getWallSegment(plan, wall)!;

  it('resolves wall anchors at the correct height and along-wall offset', () => {
    const resolved = resolveWallAnchorWorld(plan, {
      surface: 'wall',
      wallId: wall.id,
      offset: seg.length / 2,
      height: 72,
    });
    expect(resolved).not.toBeNull();
    expect(resolved!.position[1]).toBe(72);
    expect(resolved!.position[0]).toBeCloseTo(seg.innerFaceCenter[0], 0);
    expect(resolved!.position[2]).toBeCloseTo(seg.innerFaceCenter[2], 0);
  });

  it('round-trips a world hit into a wall anchor', () => {
    const world: [number, number, number] = [
      seg.innerFaceCenter[0],
      60,
      seg.innerFaceCenter[2],
    ];
    const anchor = wallAnchorFromWorldHit(seg, world);
    expect(anchor.wallId).toBe(wall.id);
    expect(anchor.height).toBe(60);
    const again = resolveWallAnchorWorld(plan, anchor)!;
    expect(again.position[1]).toBe(60);
  });

  it('keeps furniture anchors attached after move / rotate / resize', () => {
    const pose: FurniturePose = {
      attachmentKey: 'att-1',
      position: [50, 0, 40],
      rotationY: 0,
      size: [30, 32, 18],
    };
    const world: [number, number, number] = [50 + 15, 16, 40]; // right face mid-height
    const local = furnitureLocalFromWorld(pose, world);
    const anchor = {
      surface: 'furniture' as const,
      attachmentKey: 'att-1',
      local,
    };
    const before = resolveFurnitureAnchorWorld(pose, anchor);

    const moved: FurniturePose = {
      ...pose,
      position: [70, 10, 55],
      rotationY: Math.PI / 2,
      size: [40, 40, 24],
    };
    const after = resolveFurnitureAnchorWorld(moved, anchor);
    // Local y fraction preserved → world y follows base + ny * h
    expect(after.position[1]).toBeCloseTo(moved.position[1] + local[1] * moved.size[1], 5);
    // Still on the same local face relative to the item
    expect(after.position[0]).not.toBeCloseTo(before.position[0], 0);
  });

  it('sags between endpoints and includes them', () => {
    const a: [number, number, number] = [0, 80, 0];
    const b: [number, number, number] = [100, 80, 0];
    const span = saggedSpan(a, b, 0.2, 17);
    expect(span[0]).toEqual(a);
    expect(span[span.length - 1]).toEqual(b);
    const mid = span[Math.floor(span.length / 2)]!;
    expect(mid[1]).toBeLessThan(80);
    expect(mid[1]).toBeCloseTo(80 - 0.2 * 100, 5);
  });

  it('builds multi-span paths without duplicate joints', () => {
    const path = buildHangingPath(
      [
        [0, 80, 0],
        [50, 80, 0],
        [100, 70, 20],
      ],
      0.15,
      8,
    );
    expect(path.length).toBe(8 + 7); // second span drops first point
    expect(pathLength(path)).toBeGreaterThan(100);
  });

  it('samples LEDs deterministically along the path', () => {
    const path = buildHangingPath(
      [
        [0, 80, 0],
        [60, 80, 0],
      ],
      0.1,
      20,
    );
    const samples = sampleAlongPath(path, ledSpacingInches(6));
    expect(samples.length).toBeGreaterThan(5);
    expect(paletteColorAt(['#ff0000', '#00ff00'], 0)).toBe('#ff0000');
    expect(paletteColorAt(['#ff0000', '#00ff00'], 3)).toBe('#00ff00');
  });

  it('computes leaf counts from density', () => {
    expect(leafCountForPath(40, 1)).toBeGreaterThan(4);
    expect(leafCountForPath(40, 2)).toBeGreaterThan(leafCountForPath(40, 0.5));
  });

  it('parses valid hanging configs and rejects malformed ones', () => {
    const good: HangingDecorationConfig = {
      version: 1,
      kind: 'lights',
      anchors: [
        { surface: 'wall', wallId: wall.id, offset: 10, height: 70 },
        { surface: 'wall', wallId: wall.id, offset: 40, height: 70 },
      ],
      sag: 0.14,
      density: 6,
      seed: createHangingSeed(),
      palette: ['#fff4e0', '#ff6b6b'],
      lightIntensity: 1.2,
      lightRange: 56,
    };
    expect(parseHangingConfig(good)).toMatchObject({ kind: 'lights', version: 1 });
    expect(parseHangingConfig(null)).toBeNull();
    expect(parseHangingConfig({ version: 1, kind: 'lights', anchors: [] })).toBeNull();
    expect(parseHangingConfig({ ...good, version: 99 })).toBeNull();
  });

  it('detects orphan furniture references', () => {
    const cfg: HangingDecorationConfig = {
      version: 1,
      kind: 'leaves',
      anchors: [
        { surface: 'furniture', attachmentKey: 'gone', local: [0, 1, 0] },
        { surface: 'wall', wallId: wall.id, offset: 10, height: 70 },
      ],
      sag: 0.18,
      density: 1,
      seed: 1,
      palette: [],
      lightIntensity: 1,
      lightRange: 48,
    };
    expect(hangingReferencesAttachmentKey(cfg, 'gone')).toBe(true);
    expect(hangingHasMissingTargets(cfg, plan, new Set())).toBe(true);
    expect(hangingHasMissingTargets(cfg, plan, new Set(['gone']))).toBe(false);
  });

  it('mulberry32 is deterministic', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it('pathBounds pads the AABB', () => {
    const b = pathBounds([
      [0, 0, 0],
      [10, 10, 10],
    ]);
    expect(b.size[0]).toBeGreaterThan(10);
    expect(b.center[1]).toBe(b.min[1]);
  });
});
