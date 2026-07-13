import { describe, expect, it } from 'vitest';
import {
  type FloorPlan,
  allWallSegments,
  defaultRectanglePlan,
  floorFaceLoops,
  formatLength,
  getWallSegment,
  hasEnclosedFootprint,
  holesForWallSegment,
  isValidFloorPlan,
  lShapePlan,
  legacyToFloorPlan,
  moveVertex,
  openEndpointVertexIds,
  openingWorldPlacement,
  parseFloorPlan,
  pointInPolygon,
  rectanglePlan,
  resolveWallAnchor,
  sanitizeWallGraph,
  setWallLength,
  signedArea,
  snapToGrid,
  updateOpening,
  validateFloorPlan,
  wallLength,
} from '../lib/floorPlanGeometry';
import { ROOM } from '../units';

describe('floorPlanGeometry', () => {
  it('snaps to 6 inch grid', () => {
    expect(snapToGrid(7)).toBe(6);
    expect(snapToGrid(9)).toBe(12);
  });

  it('parses legacy box geometry', () => {
    const legacy = {
      width: 120,
      depth: 180,
      height: 96,
      windows: [{ wall: 'north' as const, x: 0, y: 36, w: 36, h: 36 }],
    };
    const plan = parseFloorPlan(legacy);
    expect(plan).not.toBeNull();
    expect(plan!.version).toBe(2);
    expect(plan!.walls.length).toBe(4);
    expect(plan!.openings.some((o) => o.kind === 'door')).toBe(true);
    expect(plan!.openings.some((o) => o.kind === 'window')).toBe(true);
  });

  it('validates default rectangle plan', () => {
    const plan = defaultRectanglePlan();
    expect(isValidFloorPlan(plan)).toBe(true);
    expect(validateFloorPlan(plan)).toHaveLength(0);
  });

  it('detects point inside rectangle footprint', () => {
    const plan = legacyToFloorPlan({
      width: 100,
      depth: 100,
      height: 96,
      windows: [],
    });
    expect(pointInPolygon(50, 50, plan)).toBe(true);
    expect(pointInPolygon(-5, 50, plan)).toBe(false);
  });

  it('computes positive signed area for CCW loop', () => {
    const plan = defaultRectanglePlan();
    expect(signedArea(plan)).toBeGreaterThan(0);
  });

  it('validates a room with interior partition walls', () => {
    const plan: FloorPlan = {
      version: 2,
      height: 96,
      vertices: [
        { id: 'v0', x: 0, z: 0 },
        { id: 'v1', x: 60, z: 0 },
        { id: 'v2', x: 120, z: 0 },
        { id: 'v3', x: 120, z: 120 },
        { id: 'v4', x: 60, z: 120 },
        { id: 'v5', x: 0, z: 120 },
      ],
      walls: [
        { id: 'w0', startId: 'v0', endId: 'v1' },
        { id: 'w1', startId: 'v1', endId: 'v2' },
        { id: 'w2', startId: 'v2', endId: 'v3' },
        { id: 'w3', startId: 'v3', endId: 'v4' },
        { id: 'w4', startId: 'v4', endId: 'v5' },
        { id: 'w5', startId: 'v5', endId: 'v0' },
        { id: 'w6', startId: 'v1', endId: 'v4' },
      ],
      openings: [
        {
          id: 'd0',
          wallId: 'w2',
          kind: 'door',
          offset: 44,
          width: 32,
          height: 80,
          hinge: 'left',
        },
      ],
    };
    expect(hasEnclosedFootprint(plan)).toBe(true);
    expect(isValidFloorPlan(plan)).toBe(true);
    expect(pointInPolygon(30, 60, plan)).toBe(true);
    expect(pointInPolygon(90, 60, plan)).toBe(true);
  });

  it('merges coincident corners and removes orphan points', () => {
    const plan: FloorPlan = {
      version: 2,
      height: 96,
      vertices: [
        { id: 'v0', x: 0, z: 0 },
        { id: 'v0dup', x: 0, z: 0 },
        { id: 'v1', x: 120, z: 0 },
        { id: 'v2', x: 120, z: 120 },
        { id: 'v3', x: 0, z: 120 },
        { id: 'orphan', x: 60, z: 60 },
      ],
      walls: [
        { id: 'w0', startId: 'v0', endId: 'v1' },
        { id: 'w1', startId: 'v1', endId: 'v2' },
        { id: 'w2', startId: 'v2', endId: 'v3' },
        { id: 'w3', startId: 'v3', endId: 'v0dup' },
      ],
      openings: [
        { id: 'd0', wallId: 'w0', kind: 'door', offset: 44, width: 32, height: 80, hinge: 'left' },
      ],
    };
    const cleaned = sanitizeWallGraph(plan);
    expect(cleaned.vertices.some((v) => v.id === 'orphan')).toBe(false);
    expect(cleaned.vertices.some((v) => v.id === 'v0dup')).toBe(false);
    expect(isValidFloorPlan(cleaned)).toBe(true);
  });

  it('splits an existing wall when anchoring a partition on it', () => {
    const plan: FloorPlan = {
      version: 2,
      height: 96,
      vertices: [
        { id: 'v0', x: 0, z: 0 },
        { id: 'v1', x: 72, z: 0 },
        { id: 'v2', x: 72, z: 72 },
        { id: 'v3', x: 0, z: 72 },
      ],
      walls: [
        { id: 'w0', startId: 'v0', endId: 'v1' },
        { id: 'w1', startId: 'v1', endId: 'v2' },
        { id: 'w2', startId: 'v2', endId: 'v3' },
        { id: 'w3', startId: 'v3', endId: 'v0' },
      ],
      openings: [],
    };

    const split = resolveWallAnchor(plan, 72, 36, 'vj');
    expect(split.kind).toBe('split');
    if (split.kind !== 'split') return;

    const withPartition: FloorPlan = {
      ...split.plan,
      walls: [
        ...split.plan.walls,
        { id: 'wp', startId: 'vj', endId: 'v4' },
      ],
      vertices: [...split.plan.vertices, { id: 'v4', x: 108, z: 36 }],
    };

    expect(openEndpointVertexIds(withPartition)).not.toContain('vj');
    expect(split.plan.walls.length).toBe(plan.walls.length + 1);
  });

  it('returns separate floor loops for partitioned sub-rooms', () => {
    const plan: FloorPlan = {
      version: 2,
      height: 96,
      vertices: [
        { id: 'v0', x: 0, z: 0 },
        { id: 'v1', x: 60, z: 0 },
        { id: 'v2', x: 120, z: 0 },
        { id: 'v3', x: 120, z: 120 },
        { id: 'v4', x: 60, z: 120 },
        { id: 'v5', x: 0, z: 120 },
      ],
      walls: [
        { id: 'w0', startId: 'v0', endId: 'v1' },
        { id: 'w1', startId: 'v1', endId: 'v2' },
        { id: 'w2', startId: 'v2', endId: 'v3' },
        { id: 'w3', startId: 'v3', endId: 'v4' },
        { id: 'w4', startId: 'v4', endId: 'v5' },
        { id: 'w5', startId: 'v5', endId: 'v0' },
        { id: 'w6', startId: 'v1', endId: 'v4' },
      ],
      openings: [
        {
          id: 'd0',
          wallId: 'w2',
          kind: 'door',
          offset: 44,
          width: 32,
          height: 80,
          hinge: 'left',
        },
      ],
    };
    expect(floorFaceLoops(plan)).toHaveLength(2);
  });

  it('splits overlapping collinear walls and keeps door on the middle segment', () => {
    const plan: FloorPlan = {
      version: 2,
      height: 96,
      vertices: [
        { id: 'v0', x: 0, z: 96 },
        { id: 'v1', x: 120, z: 96 },
        { id: 'v4', x: 36, z: 96 },
        { id: 'v5', x: 84, z: 96 },
      ],
      walls: [
        { id: 'long', startId: 'v0', endId: 'v1' },
        { id: 'part', startId: 'v4', endId: 'v5' },
      ],
      openings: [
        { id: 'd0', wallId: 'part', kind: 'door', offset: 8, width: 32, height: 80, hinge: 'left' },
      ],
    };

    const cleaned = sanitizeWallGraph(plan);
    expect(cleaned.walls.some((w) => w.id === 'long')).toBe(false);
    expect(cleaned.walls.length).toBeGreaterThanOrEqual(3);

    const doorOpening = cleaned.openings[0]!;
    const doorWall = cleaned.walls.find((w) => w.id === doorOpening.wallId);
    expect(doorWall).toBeDefined();
    const seg = getWallSegment(cleaned, doorWall!)!;
    const holes = holesForWallSegment(cleaned, seg);
    expect(holes).toHaveLength(1);

    for (const w of cleaned.walls) {
      if (w.id === doorOpening.wallId) continue;
      const other = getWallSegment(cleaned, w);
      if (!other) continue;
      expect(holesForWallSegment(cleaned, other)).toHaveLength(0);
    }
  });

  it('includes alcove floor even when face winding is clockwise', () => {
    const plan: FloorPlan = {
      version: 2,
      height: 96,
      vertices: [
        { id: 'v0', x: 0, z: 0 },
        { id: 'v1', x: 120, z: 0 },
        { id: 'v2', x: 120, z: 96 },
        { id: 'v3', x: 84, z: 96 },
        { id: 'v4', x: 36, z: 96 },
        { id: 'v5', x: 0, z: 96 },
        { id: 'v6', x: 36, z: 144 },
        { id: 'v7', x: 84, z: 144 },
      ],
      walls: [
        { id: 'south', startId: 'v0', endId: 'v1' },
        { id: 'east', startId: 'v1', endId: 'v2' },
        { id: 'se', startId: 'v2', endId: 'v3' },
        { id: 'aE', startId: 'v3', endId: 'v7' },
        { id: 'aS', startId: 'v7', endId: 'v6' },
        { id: 'aW', startId: 'v6', endId: 'v4' },
        { id: 'sw', startId: 'v4', endId: 'v5' },
        { id: 'west', startId: 'v5', endId: 'v0' },
        { id: 'part', startId: 'v4', endId: 'v3' },
      ],
      openings: [
        { id: 'd0', wallId: 'part', kind: 'door', offset: 8, width: 32, height: 80, hinge: 'left' },
        { id: 'd1', wallId: 'aS', kind: 'door', offset: 8, width: 32, height: 80, hinge: 'left' },
      ],
    };

    const loops = floorFaceLoops(plan);
    expect(loops).toHaveLength(2);
    expect(pointInPolygon(60, 48, plan)).toBe(true);
    expect(pointInPolygon(60, 120, plan)).toBe(true);

    const partSeg = getWallSegment(plan, plan.walls.find((w) => w.id === 'part')!)!;
    const [hole] = holesForWallSegment(plan, partSeg);
    const half = (partSeg.length + ROOM.wallThickness) / 2;
    expect(Math.abs(hole!.x) + hole!.w / 2).toBeLessThanOrEqual(half + 0.01);
  });

  it('centers wall holes on geometric segment length, not render length', () => {
    const plan: FloorPlan = {
      version: 2,
      height: 96,
      vertices: [
        { id: 'v0', x: 0, z: 0 },
        { id: 'v1', x: 120, z: 0 },
      ],
      walls: [{ id: 'w0', startId: 'v0', endId: 'v1' }],
      openings: [
        { id: 'win', wallId: 'w0', kind: 'window', offset: 42, width: 36, height: 36, sill: 36 },
      ],
    };
    const seg = getWallSegment(plan, plan.walls[0]!)!;
    const [hole] = holesForWallSegment(plan, seg);
    expect(hole!.x).toBe(0);
  });

  it('formats lengths in inches and feet', () => {
    expect(formatLength(96, 'inches')).toBe('96″');
    expect(formatLength(96, 'ft-in')).toBe('8′');
    expect(formatLength(101, 'ft-in')).toBe('8′ 5″');
  });

  it('builds custom rectangle and L-shape plans', () => {
    const rect = rectanglePlan(120, 96, 96, false);
    expect(rect.walls).toHaveLength(4);
    expect(rect.vertices).toHaveLength(4);
    expect(wallLength(rect, rect.walls[0]!)).toBe(120);

    const l = lShapePlan(120, 120, 48, 48, 96);
    expect(l.walls.length).toBeGreaterThanOrEqual(6);
    expect(isValidFloorPlan(l)).toBe(true);
  });

  it('resizes walls and moves vertices', () => {
    const plan = rectanglePlan(120, 96, 96, false);
    const wall = plan.walls[0]!;
    const resized = setWallLength(plan, wall.id, 144);
    expect(wallLength(resized, resized.walls[0]!)).toBe(144);

    const moved = moveVertex(resized, wall.endId, 198, 0);
    const end = moved.vertices.find((v) => v.id === wall.endId)!;
    expect(end.x).toBe(198);
    expect(end.z).toBe(0);
  });

  it('updates opening dimensions with clamping', () => {
    const plan = defaultRectanglePlan();
    const door = plan.openings.find((o) => o.kind === 'door')!;
    const updated = updateOpening(plan, door.id, { width: 40, height: 78 });
    const next = updated.openings.find((o) => o.id === door.id)!;
    expect(next.width).toBe(40);
    expect(next.height).toBe(78);
  });

  it('aligns hole world position with opening placement on every wall orientation', () => {
    const plan: FloorPlan = {
      version: 2,
      height: 96,
      vertices: [
        { id: 'v0', x: 0, z: 0 },
        { id: 'v1', x: 120, z: 0 },
        { id: 'v2', x: 120, z: 96 },
        { id: 'v3', x: 0, z: 96 },
      ],
      walls: [
        { id: 'south', startId: 'v0', endId: 'v1' },
        { id: 'east', startId: 'v1', endId: 'v2' },
        { id: 'north', startId: 'v2', endId: 'v3' },
        { id: 'west', startId: 'v3', endId: 'v0' },
      ],
      openings: [
        { id: 'dS', wallId: 'south', kind: 'door', offset: 44, width: 32, height: 80, hinge: 'left' },
        { id: 'wE', wallId: 'east', kind: 'window', offset: 30, width: 36, height: 36, sill: 36 },
        { id: 'wN', wallId: 'north', kind: 'window', offset: 42, width: 36, height: 36, sill: 36 },
        { id: 'wW', wallId: 'west', kind: 'window', offset: 30, width: 36, height: 36, sill: 36 },
      ],
    };

    for (const o of plan.openings) {
      const wall = plan.walls.find((w) => w.id === o.wallId)!;
      const seg = getWallSegment(plan, wall)!;
      const p = openingWorldPlacement(plan, o)!;
      const [hole] = holesForWallSegment(plan, seg);
      const rotY = seg.rotationY;
      const wx = seg.innerFaceCenter[0] + hole!.x * Math.cos(rotY);
      const wz = seg.innerFaceCenter[2] - hole!.x * Math.sin(rotY);
      expect(Math.hypot(wx - p.cx, wz - p.cz)).toBeLessThan(0.01);
    }
  });
});
