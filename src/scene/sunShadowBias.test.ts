import { describe, expect, it } from 'vitest';
import { MIN_SUN_SHADOW_NORMAL_BIAS, sunShadowNormalBias } from './Scene';

describe('sunShadowNormalBias', () => {
  it('never drops below the single-room floor', () => {
    expect(sunShadowNormalBias(40, 1024)).toBe(MIN_SUN_SHADOW_NORMAL_BIAS);
    expect(sunShadowNormalBias(10, 2048)).toBe(MIN_SUN_SHADOW_NORMAL_BIAS);
  });

  it('grows with plan size so apartment maps stay above one texel', () => {
    // ~40 ft apartment: extent ≈ max*1.1+80 ≈ 608 → pixel ≈ 1.19 at 1024.
    const apartment = sunShadowNormalBias(608, 1024);
    const room = sunShadowNormalBias(120, 1024);
    expect(apartment).toBeGreaterThan(room);
    expect(apartment).toBeCloseTo((2 * 608) / 1024, 5);
    expect(apartment).toBeGreaterThan(1);
  });
});
