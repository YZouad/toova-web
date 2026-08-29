import { describe, expect, it, beforeEach } from 'vitest';
import { DEFAULT_ROOM_GEOMETRY } from '../lib/roomGeometry';
import { useStore, type Item } from '../store';
import { resolveValidXZ, validatePlacement } from './collision';

function stub(partial: Pick<Item, 'id' | 'kind' | 'position' | 'size'> & Partial<Item>): Item {
  return {
    rotationY: 0,
    label: partial.kind,
    attachmentKey: partial.id,
    ...partial,
  };
}

describe('resolveValidXZ', () => {
  beforeEach(() => {
    useStore.setState({ roomGeometry: structuredClone(DEFAULT_ROOM_GEOMETRY) });
  });

  it('nudges a rotated item away from a neighboring object', () => {
    const desk = stub({
      id: 'desk',
      kind: 'desk',
      position: [40, 0, 50],
      size: [48, 30, 24],
    });
    const dresser = stub({
      id: 'dresser',
      kind: 'dresser',
      position: [40, 0, 80],
      size: [30, 32, 18],
    });

    const rotated = { ...desk, rotationY: Math.PI / 2 };
    expect(validatePlacement(rotated, [dresser]).ok).toBe(false);

    const resolved = resolveValidXZ(rotated, [dresser]);
    expect(resolved.ok).toBe(true);
    expect(resolved.position[2]).not.toBe(50);
    expect(validatePlacement({ ...rotated, position: resolved.position }, [dresser]).ok).toBe(true);
  });

  it('does not move an item that already fits after rotation', () => {
    const chair = stub({
      id: 'chair',
      kind: 'chair',
      position: [40, 0, 40],
      size: [18, 36, 20],
    });
    const resolved = resolveValidXZ({ ...chair, rotationY: Math.PI / 2 }, []);
    expect(resolved.ok).toBe(true);
    expect(resolved.position[0]).toBe(40);
    expect(resolved.position[2]).toBe(40);
  });

  it('reports no legal slide when the item is boxed in on all sides', () => {
    const desk = stub({
      id: 'desk',
      kind: 'desk',
      position: [50, 0, 50],
      size: [36, 20, 12],
    });
    const north = stub({ id: 'n', kind: 'dresser', position: [50, 0, 36], size: [50, 32, 10] });
    const south = stub({ id: 's', kind: 'dresser', position: [50, 0, 64], size: [50, 32, 10] });
    const west = stub({ id: 'w', kind: 'wardrobe', position: [24, 0, 50], size: [8, 32, 40] });
    const east = stub({ id: 'e', kind: 'wardrobe', position: [76, 0, 50], size: [8, 32, 40] });
    const rotated = { ...desk, rotationY: Math.PI / 2 };
    expect(resolveValidXZ(rotated, [north, south, west, east]).ok).toBe(false);
  });
});

describe('updateRotation when boxed in', () => {
  beforeEach(() => {
    useStore.setState({ roomGeometry: structuredClone(DEFAULT_ROOM_GEOMETRY), invalid: false });
  });

  it('still applies the rotation in place and marks the outline invalid', () => {
    const desk = stub({
      id: 'desk',
      kind: 'desk',
      position: [50, 0, 50],
      size: [36, 20, 12],
    });
    const north = stub({ id: 'n', kind: 'dresser', position: [50, 0, 36], size: [50, 32, 10] });
    const south = stub({ id: 's', kind: 'dresser', position: [50, 0, 64], size: [50, 32, 10] });
    const west = stub({ id: 'w', kind: 'wardrobe', position: [24, 0, 50], size: [8, 32, 40] });
    const east = stub({ id: 'e', kind: 'wardrobe', position: [76, 0, 50], size: [8, 32, 40] });
    useStore.setState({
      items: {
        desk,
        n: north,
        s: south,
        w: west,
        e: east,
      },
    });

    useStore.getState().updateRotation('desk', Math.PI / 2);
    const after = useStore.getState().items.desk;
    expect(after?.rotationY).toBe(Math.PI / 2);
    expect(after?.position[0]).toBe(50);
    expect(after?.position[2]).toBe(50);
    expect(useStore.getState().invalid).toBe(true);
  });
});
