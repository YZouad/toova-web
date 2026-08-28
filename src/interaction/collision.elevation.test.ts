import { describe, expect, it, beforeEach } from 'vitest';
import { FURNITURE } from '../furniture/registry';
import { DEFAULT_ROOM_GEOMETRY } from '../lib/roomGeometry';
import { useStore, type Item } from '../store';
import { findValidElevation } from './collision';

function stub(partial: Pick<Item, 'id' | 'kind' | 'position' | 'size'> & Partial<Item>): Item {
  return {
    rotationY: 0,
    label: partial.kind,
    attachmentKey: partial.id,
    ...partial,
  };
}

describe('findValidElevation', () => {
  beforeEach(() => {
    useStore.setState({ roomGeometry: structuredClone(DEFAULT_ROOM_GEOMETRY) });
  });

  it('does not treat hanging lights as a solid block', () => {
    const bookshelf = stub({
      id: 'book',
      kind: 'bookshelf',
      position: [50, 0, 8],
      size: FURNITURE.bookshelf.size,
    });
    // Strand along the same wall, sagging to 57" — previously capped the 32" unit at 25".
    const lights = stub({
      id: 'lights',
      kind: 'hanging',
      position: [50, 57, 8],
      size: [40, 26, 10],
    });
    expect(findValidElevation(bookshelf, [lights], 48)).toBe(48);
  });

  it('still cannot pass through another furniture volume', () => {
    const bookshelf = stub({
      id: 'book',
      kind: 'bookshelf',
      position: [50, 0, 40],
      size: FURNITURE.bookshelf.size,
    });
    const dresser = stub({
      id: 'dresser',
      kind: 'dresser',
      position: [50, 0, 40],
      size: FURNITURE.dresser.size,
    });
    expect(findValidElevation(bookshelf, [dresser], 20)).toBe(FURNITURE.dresser.size[1]);
  });
});
