import { beforeEach, describe, expect, it } from 'vitest';
import {
  type FloorPlan,
  setZoneTag,
} from '../lib/floorPlanGeometry';
import { resolveApartmentRooms } from '../lib/apartmentRooms';
import { clampPositionInRoom, clampToRoom } from './collision';
import { useStore, type Item } from '../store';

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

function makeItem(partial: Partial<Item> & Pick<Item, 'id' | 'position'>): Item {
  return {
    kind: 'chair',
    rotationY: 0,
    size: [20, 30, 20],
    label: 'Chair',
    attachmentKey: `att-${partial.id}`,
    ...partial,
  };
}

describe('collision with focused apartment room', () => {
  beforeEach(() => {
    useStore.getState().resetLayout();
  });

  it('clamps footprints inside the focused face, not across the partition', () => {
    const plan = setZoneTag(setZoneTag(partitionedPlan(), 30, 60, 'bedroom'), 90, 60, 'kitchen');
    const bedroom = resolveApartmentRooms(plan).find((r) => r.tag === 'bedroom')!;
    useStore.getState().setRoomGeometry(plan);
    useStore.getState().focusRoom(bedroom.id);

    const size: [number, number, number] = [20, 30, 20];
    // Try to drag from bedroom into kitchen (x=90).
    const [x, , z] = clampPositionInRoom([90, 0, 60], 0, size, useStore.getState().roomGeometry);
    // Without focus, clamp uses outer envelope and allows x≈90.
    // With focus, getActiveGeometry is used by clampToRoom — call it through the store path:
    const item = makeItem({ id: 'item-1', position: [30, 0, 60], size });
    useStore.setState({
      items: { [item.id]: item },
      order: [item.id],
    });
    const [cx, cz] = clampToRoom(item, 90, 60);
    expect(cx).toBeLessThan(60);
    expect(cz).toBeGreaterThan(10);
    expect(cz).toBeLessThan(110);
    // Sanity: unrestricted outer clamp would allow kitchen.
    expect(x).toBeGreaterThan(60);
  });

  it('keeps outer-envelope clamp when nothing is focused', () => {
    const plan = setZoneTag(setZoneTag(partitionedPlan(), 30, 60, 'bedroom'), 90, 60, 'kitchen');
    useStore.getState().setRoomGeometry(plan);
    useStore.getState().exitToOverview();

    const item = makeItem({ id: 'item-1', position: [30, 0, 60] });
    useStore.setState({ items: { [item.id]: item }, order: [item.id] });
    const [cx] = clampToRoom(item, 90, 60);
    expect(cx).toBeGreaterThan(60);
  });
});
