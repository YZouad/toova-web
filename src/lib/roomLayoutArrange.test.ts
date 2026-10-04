import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../furniture/registry';
import { DEFAULT_LIGHT_CONFIG, type HangingDecorationConfig } from './hangingDecorGeometry';
import { allWallSegments, rectanglePlan } from './floorPlanGeometry';
import {
  aabbsOverlap,
  doorFootprintAABBs,
  footprintBlocksDoor,
  rotatedFootprintAabb,
} from './floorClearance';
import { inches } from '../units';
import { newAttachmentKey, type Item } from '../store';
import {
  arrangeRoomItems,
  floorLayoutHasOverlaps,
  WALL_POSTER_CENTER_Y,
} from './roomLayoutArrange';

function floorItem(
  kind: Item['kind'],
  id: string,
  partial?: Partial<Item>,
): Item {
  const def = kind in FURNITURE ? FURNITURE[kind as keyof typeof FURNITURE] : null;
  const size =
    partial?.size ??
    (def ? ([...def.size] as [number, number, number]) : ([24, 24, 24] as [number, number, number]));
  return {
    id,
    kind,
    position: [0, 0, 0],
    rotationY: 0,
    size,
    label: def?.label ?? String(kind),
    attachmentKey: newAttachmentKey(),
    ...partial,
  };
}

function hangingItem(id: string, config: HangingDecorationConfig): Item {
  return {
    id,
    kind: 'hanging',
    position: [0, 0, 0],
    rotationY: 0,
    size: [12, 12, 12],
    label: 'String lights',
    attachmentKey: newAttachmentKey(),
    hanging: config,
  };
}

describe('roomLayoutArrange', () => {
  it('places nightstand beside bed with shared facing', () => {
    const plan = rectanglePlan(inches(10), inches(12));
    const items: Item[] = [
      floorItem('bed', 'bed-1'),
      floorItem('nightstand', 'ns-1'),
    ];
    const { items: arranged } = arrangeRoomItems(plan, items, 0);
    const bed = arranged.find((it) => it.id === 'bed-1')!;
    const ns = arranged.find((it) => it.id === 'ns-1')!;
    expect(bed.rotationY).toBeCloseTo(ns.rotationY, 2);
    const bedBox = rotatedFootprintAabb(bed.position[0], bed.position[2], bed.size[0], bed.size[2], bed.rotationY);
    const nsBox = rotatedFootprintAabb(ns.position[0], ns.position[2], ns.size[0], ns.size[2], ns.rotationY);
    const gapX = Math.max(0, Math.max(nsBox.minX - bedBox.maxX, bedBox.minX - nsBox.maxX));
    const gapZ = Math.max(0, Math.max(nsBox.minZ - bedBox.maxZ, bedBox.minZ - nsBox.maxZ));
    expect(Math.min(gapX, gapZ)).toBeLessThan(12);
  });

  it('places chair in front of desk facing it without door overlap', () => {
    const plan = rectanglePlan(inches(10), inches(12));
    const doors = doorFootprintAABBs(plan);
    const items: Item[] = [floorItem('desk', 'desk-1'), floorItem('chair', 'chair-1')];
    const { items: arranged, skippedIds } = arrangeRoomItems(plan, items, 0);
    expect(skippedIds).toEqual([]);
    const desk = arranged.find((it) => it.id === 'desk-1')!;
    const chair = arranged.find((it) => it.id === 'chair-1')!;
    expect(Math.abs(chair.rotationY - desk.rotationY)).toBeCloseTo(Math.PI, 2);
    expect(
      footprintBlocksDoor(
        plan,
        chair.position[0],
        chair.position[2],
        chair.size[0],
        chair.size[2],
        chair.rotationY,
        doors,
      ),
    ).toBe(false);
    const deskBox = rotatedFootprintAabb(
      desk.position[0],
      desk.position[2],
      desk.size[0],
      desk.size[2],
      desk.rotationY,
    );
    const chairBox = rotatedFootprintAabb(
      chair.position[0],
      chair.position[2],
      chair.size[0],
      chair.size[2],
      chair.rotationY,
    );
    expect(aabbsOverlap(deskBox, chairBox)).toBe(false);
  });

  it('moves bed to a different wall between variant 0 and 1', () => {
    const plan = rectanglePlan(inches(10), inches(12));
    const items: Item[] = [floorItem('bed', 'bed-1')];
    const v0 = arrangeRoomItems(plan, items, 0).items.find((it) => it.id === 'bed-1')!;
    const v1 = arrangeRoomItems(plan, items, 1).items.find((it) => it.id === 'bed-1')!;
    const moved =
      v0.position[0] !== v1.position[0] ||
      v0.position[2] !== v1.position[2] ||
      v0.rotationY !== v1.rotationY;
    expect(moved).toBe(true);
  });

  it('leaves hanging decor unchanged', () => {
    const plan = rectanglePlan(inches(10), inches(12));
    const hanging = hangingItem('hang-1', {
      ...DEFAULT_LIGHT_CONFIG,
      seed: 1,
      anchors: [
        { surface: 'wall', wallId: plan.walls[0]!.id, height: 78, offset: 24 },
        { surface: 'wall', wallId: plan.walls[0]!.id, height: 78, offset: 72 },
      ],
    });
    const items: Item[] = [floorItem('bed', 'bed-1'), hanging];
    const { items: arranged } = arrangeRoomItems(plan, items, 0);
    const next = arranged.find((it) => it.id === 'hang-1')!;
    expect(next.position).toEqual(hanging.position);
    expect(next.rotationY).toBe(hanging.rotationY);
    expect(next.hanging).toEqual(hanging.hanging);
  });

  it('keeps lamp Y on host surface', () => {
    const plan = rectanglePlan(inches(10), inches(12));
    const items: Item[] = [
      floorItem('desk', 'desk-1'),
      floorItem('lamp', 'lamp-1'),
    ];
    const { items: arranged } = arrangeRoomItems(plan, items, 0);
    const desk = arranged.find((it) => it.id === 'desk-1')!;
    const lamp = arranged.find((it) => it.id === 'lamp-1')!;
    expect(lamp.position[1]).toBe(FURNITURE.desk.size[1]);
    expect(lamp.position[0]).toBeCloseTo(desk.position[0], 0);
    expect(lamp.position[2]).toBeCloseTo(desk.position[2], 0);
  });

  it('wall-mounts poster at eye level', () => {
    const plan = rectanglePlan(inches(10), inches(12));
    const items: Item[] = [
      floorItem('bed', 'bed-1'),
      floorItem('imported', 'poster-1', {
        wallMounted: true,
        size: [24, 36, 0.5],
        label: 'Wall poster',
      }),
    ];
    const { items: arranged } = arrangeRoomItems(plan, items, 0);
    const poster = arranged.find((it) => it.id === 'poster-1')!;
    expect(poster.position[1]).toBeCloseTo(WALL_POSTER_CENTER_Y - 36 / 2, 1);
  });

  it('moves the bed when a lamp has nowhere to sit', () => {
    const plan = rectanglePlan(inches(10), inches(12));
    const items: Item[] = [floorItem('bed', 'bed-1'), floorItem('lamp', 'lamp-1')];
    const { movedIds, items: arranged } = arrangeRoomItems(plan, items, 0);
    expect(movedIds).toContain('bed-1');
    expect(floorLayoutHasOverlaps(arranged)).toBe(false);
    const bed = arranged.find((it) => it.id === 'bed-1')!;
    const lamp = arranged.find((it) => it.id === 'lamp-1')!;
    const bedBox = rotatedFootprintAabb(
      bed.position[0],
      bed.position[2],
      bed.size[0],
      bed.size[2],
      bed.rotationY,
    );
    const lampBox = rotatedFootprintAabb(
      lamp.position[0],
      lamp.position[2],
      lamp.size[0],
      lamp.size[2],
      lamp.rotationY,
    );
    expect(aabbsOverlap(bedBox, lampBox)).toBe(false);
  });

  it('keeps an object on the desk when the desk moves', () => {
    const plan = rectanglePlan(inches(12), inches(14));
    const deskTop = FURNITURE.desk.size[1];
    const desk = floorItem('desk', 'desk-1', { position: [20, 0, 30], rotationY: 0.3 });
    const lamp = floorItem('lamp', 'lamp-1', {
      position: [28, deskTop, 34],
      rotationY: 0.8,
    });
    const book = floorItem('imported', 'book-1', {
      position: [12, deskTop, 26],
      rotationY: 0.1,
      size: [8, 2, 6],
      label: 'Notebook',
    });
    const { items: arranged } = arrangeRoomItems(plan, [desk, lamp, book], 0);
    const nextDesk = arranged.find((it) => it.id === 'desk-1')!;
    for (const before of [lamp, book]) {
      const after = arranged.find((it) => it.id === before.id)!;
      const dx = before.position[0] - desk.position[0];
      const dz = before.position[2] - desk.position[2];
      const c0 = Math.cos(desk.rotationY);
      const s0 = Math.sin(desk.rotationY);
      const lx = dx * c0 - dz * s0;
      const lz = dx * s0 + dz * c0;
      const c1 = Math.cos(nextDesk.rotationY);
      const s1 = Math.sin(nextDesk.rotationY);
      expect(after.position[0]).toBeCloseTo(nextDesk.position[0] + lx * c1 + lz * s1, 1);
      expect(after.position[2]).toBeCloseTo(nextDesk.position[2] - lx * s1 + lz * c1, 1);
      expect(after.position[1]).toBeCloseTo(nextDesk.position[1] + nextDesk.size[1], 1);
      expect(after.rotationY).toBeCloseTo(
        nextDesk.rotationY + (before.rotationY - desk.rotationY),
        2,
      );
    }
  });

  it('places two wardrobes against walls without stacking them', () => {
    const plan = rectanglePlan(inches(12), inches(14));
    const items: Item[] = [
      floorItem('bed', 'bed-1'),
      floorItem('desk', 'desk-1'),
      floorItem('wardrobe', 'ward-1'),
      floorItem('wardrobe', 'ward-2'),
    ];
    const { items: arranged } = arrangeRoomItems(plan, items, 0);
    expect(floorLayoutHasOverlaps(arranged)).toBe(false);
    const walls = allWallSegments(plan);
    for (const id of ['ward-1', 'ward-2']) {
      const piece = arranged.find((it) => it.id === id)!;
      let nearest = Infinity;
      for (const seg of walls) {
        const [tx, tz] = seg.tangent;
        const t = Math.max(
          0,
          Math.min(seg.length, (piece.position[0] - seg.start.x) * tx + (piece.position[2] - seg.start.z) * tz),
        );
        const px = seg.start.x + tx * t;
        const pz = seg.start.z + tz * t;
        nearest = Math.min(nearest, Math.hypot(piece.position[0] - px, piece.position[2] - pz));
      }
      expect(nearest).toBeLessThan(piece.size[2] / 2 + 16);
    }
  });

  it('stacks a bookshelf on a dresser with both backs against the wall', () => {
    const plan = rectanglePlan(inches(5), inches(5));
    const items: Item[] = [floorItem('dresser', 'd1'), floorItem('bookshelf', 'shelf-1')];
    const { items: arranged } = arrangeRoomItems(plan, items, 0);
    expect(floorLayoutHasOverlaps(arranged)).toBe(false);
    const raised = arranged.filter((it) => it.position[1] > 1);
    expect(raised.length).toBeGreaterThan(0);
    for (const top of raised) {
      const base = arranged.find(
        (it) =>
          it.id !== top.id &&
          it.position[1] < 1 &&
          Math.hypot(it.position[0] - top.position[0], it.position[2] - top.position[2]) < 8,
      );
      expect(base).toBeTruthy();
      expect(top.rotationY).toBeCloseTo(base!.rotationY, 2);
      expect(top.position[1]).toBeCloseTo(base!.position[1] + base!.size[1], 1);
    }
    const walls = allWallSegments(plan);
    for (const piece of arranged) {
      if (piece.position[1] > 1) continue;
      let nearest = Infinity;
      for (const seg of walls) {
        const [tx, tz] = seg.tangent;
        const t = Math.max(
          0,
          Math.min(
            seg.length,
            (piece.position[0] - seg.start.x) * tx + (piece.position[2] - seg.start.z) * tz,
          ),
        );
        nearest = Math.min(
          nearest,
          Math.hypot(piece.position[0] - (seg.start.x + tx * t), piece.position[2] - (seg.start.z + tz * t)),
        );
      }
      expect(nearest).toBeLessThan(piece.size[2] / 2 + 16);
    }
  });

  it('does not stack dressers more than two high', () => {
    const plan = rectanglePlan(inches(5), inches(5));
    const items: Item[] = [
      floorItem('dresser', 'd1'),
      floorItem('dresser', 'd2'),
      floorItem('dresser', 'd3'),
    ];
    const { items: arranged } = arrangeRoomItems(plan, items, 0);
    const height = FURNITURE.dresser.size[1];
    for (const piece of arranged) {
      expect(piece.position[1]).toBeLessThanOrEqual(height + 0.5);
    }
    const raised = arranged.filter((it) => it.position[1] > 1);
    expect(raised.length).toBeGreaterThan(0);
  });

  it('does not put a desk under the bed', () => {
    const plan = rectanglePlan(inches(12), inches(14));
    const items: Item[] = [
      floorItem('bed', 'bed-1', { bedLegHeight: 40 }),
      floorItem('desk', 'desk-1', { size: [36, 28, 20] }),
    ];
    const { items: arranged } = arrangeRoomItems(plan, items, 0);
    const bed = arranged.find((it) => it.id === 'bed-1')!;
    const desk = arranged.find((it) => it.id === 'desk-1')!;
    const bedBox = rotatedFootprintAabb(bed.position[0], bed.position[2], bed.size[0], bed.size[2], bed.rotationY);
    const deskBox = rotatedFootprintAabb(desk.position[0], desk.position[2], desk.size[0], desk.size[2], desk.rotationY);
    const inside =
      deskBox.minX >= bedBox.minX - 1 &&
      deskBox.maxX <= bedBox.maxX + 1 &&
      deskBox.minZ >= bedBox.minZ - 1 &&
      deskBox.maxZ <= bedBox.maxZ + 1;
    expect(inside).toBe(false);
  });

  it('keeps a wardrobe off a window when another wall is open', () => {
    const plan = rectanglePlan(inches(14), inches(10), 96, false);
    const windowWall = plan.walls[0]!;
    plan.openings.push({
      id: 'win',
      wallId: windowWall.id,
      kind: 'window',
      offset: 0,
      width: 60,
      height: 36,
      sill: 36,
    });
    const { items: arranged } = arrangeRoomItems(plan, [floorItem('wardrobe', 'w1')], 0);
    const piece = arranged.find((it) => it.id === 'w1')!;
    const seg = allWallSegments(plan).find((s) => s.wall.id === windowWall.id)!;
    const [tx, tz] = seg.tangent;
    const along = (piece.position[0] - seg.start.x) * tx + (piece.position[2] - seg.start.z) * tz;
    const half = piece.size[0] / 2;
    const coversWindow = along - half < 60 && along + half > 0;
    expect(coversWindow).toBe(false);
  });

  it('tucks a short piece under the bed when it fits the leg clearance', () => {
    const plan = rectanglePlan(inches(12), inches(14));
    const items: Item[] = [
      floorItem('bed', 'bed-1', { bedLegHeight: 12 }),
      floorItem('imported', 'bin-1', { size: [24, 6, 16], label: 'Underbed bin' }),
    ];
    const { items: arranged } = arrangeRoomItems(plan, items, 0);
    const bed = arranged.find((it) => it.id === 'bed-1')!;
    const bin = arranged.find((it) => it.id === 'bin-1')!;
    expect(bin.position[1]).toBe(0);
    const bedBox = rotatedFootprintAabb(bed.position[0], bed.position[2], bed.size[0], bed.size[2], bed.rotationY);
    const binBox = rotatedFootprintAabb(bin.position[0], bin.position[2], bin.size[0], bin.size[2], bin.rotationY);
    expect(binBox.minX).toBeGreaterThanOrEqual(bedBox.minX - 2);
    expect(binBox.maxX).toBeLessThanOrEqual(bedBox.maxX + 2);
    expect(binBox.minZ).toBeGreaterThanOrEqual(bedBox.minZ - 2);
    expect(binBox.maxZ).toBeLessThanOrEqual(bedBox.maxZ + 2);
    expect(floorLayoutHasOverlaps(arranged)).toBe(false);
  });

  it('arranges a full bedroom without floor overlaps on any variant', () => {
    const plan = rectanglePlan(inches(14), inches(16));
    const items: Item[] = [
      floorItem('bed', 'bed-1'),
      floorItem('nightstand', 'ns-1'),
      floorItem('nightstand', 'ns-2'),
      floorItem('desk', 'desk-1'),
      floorItem('chair', 'chair-1'),
      floorItem('lamp', 'lamp-1'),
      floorItem('dresser', 'dresser-1'),
    ];
    for (const variant of [0, 1, 2] as const) {
      const { items: arranged, skippedIds } = arrangeRoomItems(plan, items, variant);
      expect(skippedIds).toEqual([]);
      expect(floorLayoutHasOverlaps(arranged)).toBe(false);
    }
  });

  it('returns unchanged layout when corner variant cannot fit bed in tiny room', () => {
    const plan = rectanglePlan(inches(6), inches(6));
    const items: Item[] = [
      floorItem('bed', 'bed-1', {
        size: [60, 22, 80],
      }),
    ];
    const before = items[0]!.position;
    const { items: arranged, movedIds } = arrangeRoomItems(plan, items, 2);
    expect(movedIds).toEqual([]);
    expect(arranged[0]!.position).toEqual(before);
  });
});
