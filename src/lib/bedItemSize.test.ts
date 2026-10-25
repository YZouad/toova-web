import { describe, expect, it } from 'vitest';
import { proportionalBedFootprintFromMaxSide } from './bedItemSize';

describe('proportionalBedFootprintFromMaxSide', () => {
  it('scales width and depth and resets stack to default body + legs', () => {
    const next = proportionalBedFootprintFromMaxSide([38, 86, 75], 76, 8);
    expect(next[1]).toBe(22);
    expect(next[2]).toBe(76);
    expect(next[0]).toBeCloseTo(38.5, 0);
  });
});
