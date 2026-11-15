import { beforeEach, describe, expect, it } from 'vitest';
import { FURNITURE } from '../furniture/registry';
import { setZoneTag, type FloorPlan } from './floorPlanGeometry';
import { itemRoomKey, resolveApartmentRooms } from './apartmentRooms';
import { newAttachmentKey, useStore, type Item } from '../store';
import { resolveShuffleScope, shuffleRoomLayout } from './shuffleRoomLayout';

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
    openings: [],
  };
}

function taggedApartment(): FloorPlan {
  return setZoneTag(setZoneTag(partitionedPlan(), 30, 60, 'bedroom'), 90, 60, 'kitchen');
}

function floorItem(kind: Item['kind'], id: string, position: [number, number, number]): Item {
  const def = kind in FURNITURE ? FURNITURE[kind as keyof typeof FURNITURE] : null;
  const size = def ? ([...def.size] as [number, number, number]) : ([24, 24, 24] as [number, number, number]);
  return {
    id,
    kind,
    position,
    rotationY: 0,
    size,
    label: def?.label ?? String(kind),
    attachmentKey: newAttachmentKey(),
  };
}

describe('shuffleRoomLayout apartment isolation', () => {
  beforeEach(() => {
    useStore.getState().resetLayout();
  });

  it('resolveShuffleScope is null in apartment overview', () => {
    const plan = taggedApartment();
    const bed = floorItem('bed', 'bed-a', [30, 0, 60]);
    useStore.setState({
      roomGeometry: plan,
      focusedRoomId: null,
      items: { 'bed-a': bed },
      order: ['bed-a'],
    });
    expect(resolveShuffleScope(useStore.getState())).toBeNull();
  });

  it('shuffle only moves furniture in the focused room', () => {
    const plan = taggedApartment();
    const rooms = resolveApartmentRooms(plan);
    const bedroom = rooms.find((r) => r.tag === 'bedroom')!;
    const kitchen = rooms.find((r) => r.tag === 'kitchen')!;

    const bed = floorItem('bed', 'bed-a', [30, 0, 60]);
    const desk = floorItem('desk', 'desk-k', [90, 0, 60]);
    const kitchenStart = [...desk.position] as [number, number, number];

    useStore.setState({
      roomGeometry: plan,
      focusedRoomId: bedroom.id,
      items: { 'bed-a': bed, 'desk-k': desk },
      order: ['bed-a', 'desk-k'],
      layoutShuffleVariant: 0,
    });

    const moved = shuffleRoomLayout();
    expect(moved).toBe(true);

    const after = useStore.getState();
    const kitchenPos = after.items['desk-k']!.position;
    expect(kitchenPos[0]).toBe(kitchenStart[0]);
    expect(kitchenPos[2]).toBe(kitchenStart[2]);
    expect(itemRoomKey(plan, kitchenPos[0], kitchenPos[2])).toBe(kitchen.id);

    const bedPos = after.items['bed-a']!.position;
    expect(itemRoomKey(plan, bedPos[0], bedPos[2])).toBe(bedroom.id);
  });
});
