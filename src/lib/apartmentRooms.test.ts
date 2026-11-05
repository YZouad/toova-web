import { describe, expect, it } from 'vitest';
import {
  type FloorPlan,
  faceLoopKey,
  setZoneTag,
  zoneAtPoint,
} from './floorPlanGeometry';
import {
  UNPLACED_ROOM_KEY,
  apartmentRoomById,
  groupItemsByRoom,
  isApartmentPlan,
  itemRoomKey,
  planForFace,
  resolveApartmentRooms,
  roomAtFloorPoint,
  roomSpawnPoint,
} from './apartmentRooms';

function partitionedPlan(): FloorPlan {
  return {
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
      {
        id: 'd1',
        wallId: 'w6',
        kind: 'door',
        offset: 44,
        width: 32,
        height: 80,
        hinge: 'left',
      },
    ],
  };
}

function taggedApartment(): FloorPlan {
  return setZoneTag(setZoneTag(partitionedPlan(), 30, 60, 'bedroom', 'Primary'), 90, 60, 'kitchen');
}

describe('apartmentRooms', () => {
  it('isApartmentPlan requires 2+ tagged zones', () => {
    expect(isApartmentPlan(partitionedPlan())).toBe(false);
    expect(isApartmentPlan(setZoneTag(partitionedPlan(), 30, 60, 'bedroom'))).toBe(false);
    expect(isApartmentPlan(taggedApartment())).toBe(true);
  });

  it('resolves tagged and untagged rooms with stable ids', () => {
    const untagged = resolveApartmentRooms(partitionedPlan());
    expect(untagged).toHaveLength(2);
    expect(untagged.every((r) => !r.tagged)).toBe(true);
    expect(untagged.every((r) => r.id.startsWith('face:'))).toBe(true);

    const plan = taggedApartment();
    const tagged = resolveApartmentRooms(plan);
    expect(tagged).toHaveLength(2);
    expect(tagged.every((r) => r.tagged)).toBe(true);
    const labels = tagged.map((r) => r.label).sort();
    expect(labels).toEqual(['Kitchen', 'Primary']);
    for (const r of tagged) {
      expect(apartmentRoomById(plan, r.id)?.id).toBe(r.id);
    }
  });

  it('roomAtFloorPoint picks the face under the cursor', () => {
    const plan = taggedApartment();
    expect(roomAtFloorPoint(plan, 30, 60)?.tag).toBe('bedroom');
    expect(roomAtFloorPoint(plan, 90, 60)?.tag).toBe('kitchen');
    expect(roomAtFloorPoint(plan, -10, -10)).toBeNull();
  });

  it('planForFace returns a single-loop plan with boundary openings', () => {
    const plan = taggedApartment();
    const bedroom = resolveApartmentRooms(plan).find((r) => r.tag === 'bedroom')!;
    const facePlan = planForFace(plan, bedroom);
    expect(facePlan.height).toBe(96);
    expect(facePlan.walls.length).toBe(4);
    expect(facePlan.zones).toHaveLength(1);
    expect(facePlan.zones![0]!.tag).toBe('bedroom');
    // Partition door (w6) and outer door (w2) — bedroom only has the partition.
    expect(facePlan.openings.every((o) => bedroom.wallIds.includes(o.wallId))).toBe(true);
    expect(facePlan.openings.some((o) => o.wallId === 'w6')).toBe(true);
    expect(facePlan.openings.some((o) => o.wallId === 'w2')).toBe(false);

    const kitchen = resolveApartmentRooms(plan).find((r) => r.tag === 'kitchen')!;
    const kitchenPlan = planForFace(plan, kitchen);
    expect(kitchenPlan.openings.some((o) => o.wallId === 'w2')).toBe(true);
  });

  it('assigns items by footprint center and marks unplaced', () => {
    const plan = taggedApartment();
    const bedroom = resolveApartmentRooms(plan).find((r) => r.tag === 'bedroom')!;
    const kitchen = resolveApartmentRooms(plan).find((r) => r.tag === 'kitchen')!;

    expect(itemRoomKey(plan, 30, 60)).toBe(bedroom.id);
    expect(itemRoomKey(plan, 90, 60)).toBe(kitchen.id);
    expect(itemRoomKey(plan, -5, -5)).toBeNull();

    // Straddling partition: center decides.
    expect(itemRoomKey(plan, 55, 60)).toBe(bedroom.id);
    expect(itemRoomKey(plan, 65, 60)).toBe(kitchen.id);

    const grouped = groupItemsByRoom(plan, [
      { id: 'a', x: 30, z: 60 },
      { id: 'b', x: 90, z: 60 },
      { id: 'c', x: -10, z: 0 },
    ]);
    expect(grouped.get(bedroom.id)).toEqual(['a']);
    expect(grouped.get(kitchen.id)).toEqual(['b']);
    expect(grouped.get(UNPLACED_ROOM_KEY)).toEqual(['c']);
  });

  it('roomSpawnPoint returns an interior point', () => {
    const plan = taggedApartment();
    const bedroom = resolveApartmentRooms(plan).find((r) => r.tag === 'bedroom')!;
    const [x, z] = roomSpawnPoint(bedroom);
    expect(zoneAtPoint(plan, x, z)?.zone?.tag).toBe('bedroom');
    expect(faceLoopKey(bedroom.face)).toBe(bedroom.faceKey);
  });
});
