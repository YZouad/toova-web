import { describe, expect, it, vi, beforeEach } from 'vitest';
import { rectanglePlan } from './floorPlanGeometry';
import { inches } from '../units';
import { FURNITURE } from '../furniture/registry';
import { defaultPlaceInRoom } from './agenticRoomPlacement';
import {
  buildAgenticPackPieces,
  packAgenticFloorItems,
  WALL_POSTER_CENTER_Y,
  type AgenticPackRow,
} from './agenticRoomPack';
import { doorFootprintAABBs, footprintBlocksDoor, rotatedFootprintAabb } from './floorClearance';

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

function mockRow(partial: Partial<AgenticPackRow> & { query: string }): AgenticPackRow {
  return {
    query: partial.query,
    qty: partial.qty ?? 1,
    product: partial.product ?? null,
    alternates: partial.alternates ?? [],
    score: partial.score ?? 0,
    builtinKind: partial.builtinKind ?? null,
    warnings: partial.warnings ?? [],
    searchOffers: partial.searchOffers ?? [],
    placeInRoom: partial.placeInRoom ?? true,
    communityModel: partial.communityModel ?? null,
    bankPoster: partial.bankPoster ?? null,
  };
}

describe('agenticRoomPack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults bedding and generic poster rows to checklist-only', () => {
    expect(defaultPlaceInRoom(mockRow({ query: 'gothic bedding set' }))).toBe(false);
    expect(defaultPlaceInRoom(mockRow({ query: 'wall poster' }))).toBe(false);
    expect(defaultPlaceInRoom(mockRow({ query: 'queen bed frame', builtinKind: 'bed' }))).toBe(true);
  });

  it('defaults bank poster hits to place in room', () => {
    expect(
      defaultPlaceInRoom(
        mockRow({
          query: 'gothic wall poster',
          bankPoster: {
            kind: 'poster-gothic-cathedral',
            label: 'Gothic cathedral architecture wall poster',
            modelUrl: 'checklist-refs/glb/posters/poster-gothic-cathedral.glb',
            widthIn: 24,
            heightIn: 36,
            depthIn: 0.5,
            score: 55,
          },
        }),
      ),
    ).toBe(true);
  });

  it('packs bed, desk, and chair without door overlap on 10×12', () => {
    const plan = rectanglePlan(inches(10), inches(12));
    const doors = doorFootprintAABBs(plan);
    const pieces = [
      { query: 'bed', label: 'Bed', kind: 'bed' as const, size: [...FURNITURE.bed.size] as [number, number, number], isLamp: false },
      { query: 'desk', label: 'Desk', kind: 'desk' as const, size: [...FURNITURE.desk.size] as [number, number, number], isLamp: false },
      { query: 'chair', label: 'Chair', kind: 'chair' as const, size: [...FURNITURE.chair.size] as [number, number, number], isLamp: false },
    ];
    const { items, skipped } = packAgenticFloorItems(plan, pieces);
    expect(skipped).toEqual([]);
    expect(items).toHaveLength(3);

    for (const item of items) {
      expect(
        footprintBlocksDoor(plan, item.position[0], item.position[2], item.size[0], item.size[2], item.rotationY, doors),
      ).toBe(false);
    }

    const aabbs = items.map((it) =>
      rotatedFootprintAabb(it.position[0], it.position[2], it.size[0], it.size[2], it.rotationY),
    );
    for (let i = 0; i < aabbs.length; i++) {
      for (let j = i + 1; j < aabbs.length; j++) {
        const a = aabbs[i]!;
        const b = aabbs[j]!;
        const overlap =
          a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
        expect(overlap).toBe(false);
      }
    }
  });

  it('places lamp on desk surface height', () => {
    const plan = rectanglePlan(inches(10), inches(12));
    const pieces = [
      { query: 'desk', label: 'Desk', kind: 'desk' as const, size: [...FURNITURE.desk.size] as [number, number, number], isLamp: false },
      { query: 'lamp', label: 'Lamp', kind: 'lamp' as const, size: [...FURNITURE.lamp.size] as [number, number, number], isLamp: true },
    ];
    const { items } = packAgenticFloorItems(plan, pieces);
    const lamp = items.find((it) => it.kind === 'lamp');
    const desk = items.find((it) => it.kind === 'desk');
    expect(lamp).toBeDefined();
    expect(desk).toBeDefined();
    expect(lamp!.position[1]).toBe(FURNITURE.desk.size[1]);
  });

  it('skips unchecked bedding rows when building pieces', async () => {
    const rows = [
      mockRow({ query: 'bedding set', placeInRoom: false }),
      mockRow({ query: 'wall poster', placeInRoom: false }),
    ];
    const pieces = await buildAgenticPackPieces(rows);
    expect(pieces).toHaveLength(0);
  });

  it('wall-mounts matched bank poster at eye level without door overlap', async () => {
    const plan = rectanglePlan(inches(10), inches(12));
    const doors = doorFootprintAABBs(plan);
    const rows = [
      mockRow({
        query: 'gothic wall poster',
        placeInRoom: true,
        bankPoster: {
          kind: 'poster-gothic-cathedral',
          label: 'Gothic cathedral architecture wall poster',
          modelUrl: 'checklist-refs/glb/posters/poster-gothic-cathedral.glb',
          widthIn: 24,
          heightIn: 36,
          depthIn: 0.5,
          score: 55,
        },
      }),
    ];
    const pieces = await buildAgenticPackPieces(rows);
    const { items, skipped } = packAgenticFloorItems(plan, pieces);
    expect(skipped).toEqual([]);
    expect(items).toHaveLength(1);
    const poster = items[0]!;
    expect(poster.kind).toBe('imported');
    expect(poster.wallMounted).toBe(true);
    expect(poster.position[1]).toBeCloseTo(WALL_POSTER_CENTER_Y - 36 / 2, 1);
    expect(
      footprintBlocksDoor(
        plan,
        poster.position[0],
        poster.position[2],
        poster.size[0],
        poster.size[2],
        poster.rotationY,
        doors,
      ),
    ).toBe(false);
  });

  it('builds imported piece from community model selection', async () => {
    const rows = [
      mockRow({
        query: 'minecraft poster',
        placeInRoom: true,
        communityModel: {
          kind: 'mc-poster',
          label: 'Minecraft Poster',
          previewUrl: null,
          modelUrl: 'community/mc-poster.glb',
          widthIn: 24,
          heightIn: 36,
          depthIn: 1,
          creatorHandle: null,
          creatorDisplayName: null,
          relevance: 1,
        },
      }),
    ];
    const pieces = await buildAgenticPackPieces(rows);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.kind).toBe('imported');
    expect(pieces[0]!.importedStoragePath).toBe('community/mc-poster.glb');
  });
});
