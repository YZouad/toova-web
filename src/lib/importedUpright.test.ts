import { describe, expect, it } from 'vitest';
import {
  isFlatOnY,
  shouldStandImportedUpright,
  standUpFlatBounds,
  standUpRotationAxis,
} from './importedUpright';

describe('importedUpright', () => {
  it('matches monitor and lamp labels', () => {
    expect(shouldStandImportedUpright('Monitor')).toBe(true);
    expect(shouldStandImportedUpright('Desk lamp')).toBe(true);
    expect(shouldStandImportedUpright('Wooden clock')).toBe(true);
    expect(shouldStandImportedUpright('Chair')).toBe(false);
    expect(shouldStandImportedUpright('Rug')).toBe(false);
    expect(shouldStandImportedUpright('Frying pan')).toBe(false);
  });

  it('stands a flat monitor bounds up around X', () => {
    expect(isFlatOnY([14.5, 2, 24.5])).toBe(true);
    expect(standUpRotationAxis([14.5, 2, 24.5])).toBe('x');
    expect(standUpFlatBounds([14.5, 2, 24.5])).toEqual([14.5, 24.5, 2]);
    expect(standUpFlatBounds([24.5, 14.5, 2])).toEqual([24.5, 14.5, 2]);
  });

  it('stands a floor lamp generated along X', () => {
    expect(standUpRotationAxis([1, 0.2, 0.18])).toBe('z');
    expect(standUpFlatBounds([1, 0.2, 0.18])).toEqual([0.2, 1, 0.18]);
  });
});
