import { describe, expect, it } from 'vitest';
import { resolveCabinetDrawerGrid, limitsForCabinetKind } from './cabinetDrawerGrid';

describe('resolveCabinetDrawerGrid', () => {
  it('uses explicit rows and columns with full grid', () => {
    const grid = resolveCabinetDrawerGrid(
      { drawerRows: 2, drawerColumns: 4 },
      3,
      limitsForCabinetKind('dresser', false),
    );
    expect(grid).toEqual({
      drawerRows: 2,
      drawerColumns: 4,
      drawers: 8,
      columns: 4,
    });
  });

  it('clamps product to dresser max total', () => {
    const grid = resolveCabinetDrawerGrid(
      { drawerRows: 4, drawerColumns: 4 },
      3,
      limitsForCabinetKind('dresser', false),
    );
    expect(grid.drawers).toBeLessThanOrEqual(8);
    expect(grid.drawerRows * grid.drawerColumns).toBe(grid.drawers);
  });

  it('fills legacy odd counts into a full grid', () => {
    const grid = resolveCabinetDrawerGrid(
      { drawers: 7, columns: 4, drawerArrangement: 'grid' },
      3,
      limitsForCabinetKind('dresser', false),
    );
    expect(grid.drawers).toBe(8);
    expect(grid.drawerRows).toBe(2);
    expect(grid.drawerColumns).toBe(4);
  });

  it('maps legacy wide row to one row', () => {
    const grid = resolveCabinetDrawerGrid(
      { drawers: 3, drawerArrangement: 'wide' },
      3,
      limitsForCabinetKind('dresser', false),
    );
    expect(grid.drawerRows).toBe(1);
    expect(grid.drawerColumns).toBe(3);
    expect(grid.drawers).toBe(3);
  });
});
