import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { pickItemUnderRay } from './pickItemUnderPointer';
import type { Item } from '../store';

function item(partial: Partial<Item> & Pick<Item, 'id' | 'position' | 'size'>): Item {
  return {
    kind: 'chair',
    rotationY: 0,
    ...partial,
  } as Item;
}

describe('pickItemUnderRay', () => {
  it('hits a box under a downward ray', () => {
    const chair = item({
      id: 'a',
      position: [0, 0, 0],
      size: [20, 40, 20],
    });
    const ray = new THREE.Ray(new THREE.Vector3(0, 100, 0), new THREE.Vector3(0, -1, 0));
    const hit = pickItemUnderRay(ray, [chair]);
    expect(hit?.id).toBe('a');
    expect(hit!.distance).toBeCloseTo(60, 5); // 100 - 40
  });

  it('ignores items behind the max distance', () => {
    const chair = item({
      id: 'a',
      position: [0, 0, 0],
      size: [20, 40, 20],
    });
    const ray = new THREE.Ray(new THREE.Vector3(0, 100, 0), new THREE.Vector3(0, -1, 0));
    expect(pickItemUnderRay(ray, [chair], 10)).toBeNull();
  });

  it('prefers the nearer of two overlapping footprints', () => {
    const far = item({ id: 'far', position: [0, 0, 0], size: [20, 20, 20] });
    const near = item({ id: 'near', position: [0, 30, 0], size: [10, 10, 10] });
    const ray = new THREE.Ray(new THREE.Vector3(0, 100, 0), new THREE.Vector3(0, -1, 0));
    expect(pickItemUnderRay(ray, [far, near])?.id).toBe('near');
  });
});
