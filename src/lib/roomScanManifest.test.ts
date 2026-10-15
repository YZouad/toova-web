import { describe, expect, it } from 'vitest';
import {
  appendSinglePhotoScanWarning,
  clampScanFootprintCenter,
  manifestToFurnitureList,
  parseRoomScanManifest,
  ROOM_SCAN_SINGLE_PHOTO_WARNING,
} from './roomScanManifest';
import { rectanglePlan } from './floorPlanGeometry';
import {
  buildAgenticPackPieces,
  packAgenticFloorItems,
  type AgenticPackRow,
} from './agenticRoomPack';

describe('roomScanManifest', () => {
  it('parses appearance block onto list scanAppearance and colorScheme', () => {
    const manifest = parseRoomScanManifest({
      widthIn: 120,
      depthIn: 144,
      appearance: {
        wallColor: '#E5E0D8',
        floorPreset: 'lightOak',
        colorScheme: ['#E5E0D8', '#C9A962', '#1B4332'],
        rugColor: '#1B4332',
        floorPatternApproximated: true,
      },
      items: [{ scanId: 'r1', query: 'dark green area rug', qty: 1 }],
      warnings: [],
    });
    expect(manifest?.appearance?.floorPreset).toBe('lightOak');
    const { list } = manifestToFurnitureList(manifest!);
    expect(list.scanAppearance?.rugColor).toBe('#1b4332');
    expect(list.colorScheme?.[2]).toBe('#1b4332');
  });

  it('parses valid vision JSON and maps to furniture list', () => {
    const manifest = parseRoomScanManifest({
      widthIn: 120,
      depthIn: 144,
      heightIn: 96,
      roomType: 'dorm bedroom',
      items: [
        {
          scanId: 'a1',
          query: 'queen bed frame',
          qty: 1,
          sizeIn: [60, 36, 80],
          positionIn: { x: 72, z: 100 },
          rotationY: 0,
          locationLabel: 'center of room',
          frameIndex: 2,
          bbox: { xmin: 0.2, ymin: 0.3, xmax: 0.7, ymax: 0.9 },
        },
      ],
      warnings: ['extra note'],
    });
    expect(manifest).not.toBeNull();
    const { list, sidecar } = manifestToFurnitureList(manifest!);
    expect(list.source).toBe('room-scan');
    expect(list.widthIn).toBe(120);
    expect(list.items[0]?.scanId).toBe('a1');
    expect(sidecar.a1?.positionIn).toEqual({ x: 72, z: 100 });
  });

  it('appends single-photo warning once', () => {
    const { list: base } = manifestToFurnitureList({
      widthIn: 120,
      depthIn: 120,
      items: [{ scanId: 'a', query: 'desk', qty: 1 }],
      warnings: ['existing'],
    });
    const once = appendSinglePhotoScanWarning(base);
    expect(once.warnings).toContain(ROOM_SCAN_SINGLE_PHOTO_WARNING);
    expect(appendSinglePhotoScanWarning(once).warnings.filter((w) => w === ROOM_SCAN_SINGLE_PHOTO_WARNING)).toHaveLength(1);
  });

  it('clamps footprint center inside room bounds', () => {
    const clamped = clampScanFootprintCenter(120, 120, [60, 30, 80], { x: 5, z: 5 }, 0);
    expect(clamped.x).toBeGreaterThan(30);
    expect(clamped.z).toBeGreaterThan(40);
  });
});

describe('pack with scan pose', () => {
  it('pins scanned pieces at estimated coordinates', async () => {
    const row: AgenticPackRow = {
      query: 'desk',
      qty: 1,
      product: null,
      alternates: [],
      score: 0,
      builtinKind: 'desk',
      warnings: [],
      searchOffers: [],
      placeInRoom: true,
      communityModel: null,
      bankPoster: null,
      scan: {
        scanId: 'd1',
        scanSizeIn: [48, 30, 24],
        scanPose: { x: 96, z: 40, rotationY: 0 },
      },
    };
    const plan = rectanglePlan(120, 144);
    const pieces = await buildAgenticPackPieces([row], plan, { preserveAllBeds: true });
    expect(pieces[0]?.scanPose).toEqual({ x: 96, z: 40, rotationY: 0 });
    const packed = packAgenticFloorItems(plan, pieces);
    expect(packed.items[0]?.position[0]).toBeCloseTo(96, 0);
    expect(packed.items[0]?.position[2]).toBeCloseTo(40, 0);
  });
});
