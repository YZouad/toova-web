import { describe, expect, it } from 'vitest';
import {
  posterCatalogSize,
  posterPositionPreservingCenterY,
  posterSizeFromNatural,
  posterWidthInForHeight,
} from './posterSize';

describe('posterSize', () => {
  it('derives width from image aspect at a target height', () => {
    expect(posterWidthInForHeight(1600, 900, 36)).toBe(64);
    expect(posterWidthInForHeight(900, 1600, 36)).toBe(20.25);
  });

  it('uses mesh natural bounds as poster display size', () => {
    expect(posterSizeFromNatural([18, 24, 0])).toEqual([18, 24, 0.5]);
  });

  it('preserves vertical center when height changes', () => {
    const next = posterPositionPreservingCenterY([10, 39, 5], 36, 24);
    expect(next[0]).toBe(10);
    expect(next[2]).toBe(5);
    expect(next[1] + 24 / 2).toBeCloseTo(39 + 36 / 2, 5);
  });

  it('normalizes catalog poster dimensions', () => {
    expect(posterCatalogSize(18, 24, 0)).toEqual([18, 24, 0.5]);
  });
});
