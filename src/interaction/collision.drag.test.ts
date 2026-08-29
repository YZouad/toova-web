import { describe, expect, it, beforeEach } from 'vitest';
import { DEFAULT_ROOM_GEOMETRY } from '../lib/roomGeometry';
import { useStore, type Item } from '../store';
import { resolveGroupDragDelta } from './collision';

function stub(partial: Pick<Item, 'id' | 'kind' | 'position' | 'size'> & Partial<Item>): Item {
  return {
    rotationY: 0,
    label: partial.kind,
    attachmentKey: partial.id,
    ...partial,
  };
}

describe('resolveGroupDragDelta', () => {
  beforeEach(() => {
    useStore.setState({ roomGeometry: structuredClone(DEFAULT_ROOM_GEOMETRY) });
  });

  it('follows the cursor when the path is clear', () => {
    const mover = stub({
      id: 'chair',
      kind: 'chair',
      position: [40, 0, 40],
      size: [10, 10, 10],
    });
    const result = resolveGroupDragDelta(
      [{ item: mover, start: [40, 0, 40] }],
      [],
      8,
      -4,
      0,
      0,
    );
    expect(result).toEqual({ dx: 8, dz: -4, desiredOk: true });
  });

  it('slides along a blocker instead of freezing', () => {
    const mover = stub({
      id: 'chair',
      kind: 'chair',
      position: [40, 0, 40],
      size: [10, 10, 10],
    });
    // Occupies x 65–85, z 35–45 — sitting to the right of the chair.
    const blocker = stub({
      id: 'dresser',
      kind: 'dresser',
      position: [75, 0, 40],
      size: [20, 20, 10],
    });
    // Cursor wants to go through the dresser (+30 X) and a bit forward (+8 Z).
    const result = resolveGroupDragDelta(
      [{ item: mover, start: [40, 0, 40] }],
      [blocker],
      30,
      8,
      0,
      0,
    );
    expect(result.desiredOk).toBe(false);
    // Must not stay frozen at the origin — Z motion along the face is free.
    expect(result.dz).toBeGreaterThan(6);
    // Must not penetrate the dresser (chair half-width 5, dresser starts at 65).
    expect(40 + result.dx + 5).toBeLessThanOrEqual(65.5);
  });

  it('stops at the contact face when dragging straight into another object', () => {
    const mover = stub({
      id: 'chair',
      kind: 'chair',
      position: [40, 0, 40],
      size: [10, 10, 10],
    });
    const blocker = stub({
      id: 'dresser',
      kind: 'dresser',
      position: [75, 0, 40],
      size: [20, 20, 10],
    });
    const result = resolveGroupDragDelta(
      [{ item: mover, start: [40, 0, 40] }],
      [blocker],
      40,
      0,
      0,
      0,
    );
    expect(result.desiredOk).toBe(false);
    expect(result.dz).toBe(0);
    expect(result.dx).toBeGreaterThan(10);
    expect(40 + result.dx + 5).toBeLessThanOrEqual(65.5);
  });

  it('lets an already-overlapping item follow the cursor so it can unstick', () => {
    const mover = stub({
      id: 'chair',
      kind: 'chair',
      position: [50, 0, 40],
      size: [10, 10, 10],
    });
    const blocker = stub({
      id: 'dresser',
      kind: 'dresser',
      position: [50, 0, 40],
      size: [20, 20, 10],
    });
    // +4" is still inside the dresser; without the unstick path this would freeze at 0.
    const result = resolveGroupDragDelta(
      [{ item: mover, start: [50, 0, 40] }],
      [blocker],
      4,
      0,
      0,
      0,
    );
    expect(result.dx).toBe(4);
    expect(result.desiredOk).toBe(false);
  });
});
