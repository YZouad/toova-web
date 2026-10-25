import type { DrawerArrangement, FurnitureBuild } from './types';

export type CabinetDrawerGridLimits = {
  maxRows: number;
  maxCols: number;
  maxTotal: number;
};

export type CabinetDrawerGrid = {
  drawerRows: number;
  drawerColumns: number;
  /** Always drawerRows × drawerColumns (full grid). */
  drawers: number;
  /** Same as drawerColumns; kept for mesh code. */
  columns: number;
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function clampGridToLimits(
  rows: number,
  cols: number,
  limits: CabinetDrawerGridLimits,
): { rows: number; cols: number } {
  let r = clampInt(rows, 1, limits.maxRows);
  let c = clampInt(cols, 1, limits.maxCols);
  while (r * c > limits.maxTotal) {
    if (r > 1) r--;
    else if (c > 1) c--;
    else break;
  }
  return { rows: r, cols: c };
}

function legacyGridFromMerged(
  merged: FurnitureBuild,
  defaultDrawers: number,
  limits: CabinetDrawerGridLimits,
): { rows: number; cols: number } {
  const arrangement: DrawerArrangement | undefined = merged.drawerArrangement;
  const drawerCount = clampInt(merged.drawers ?? defaultDrawers, 1, limits.maxTotal);
  const colHint = merged.drawerColumns ?? merged.columns ?? 1;

  if (arrangement === 'wide') {
    return clampGridToLimits(1, Math.min(drawerCount, limits.maxCols), limits);
  }
  if (arrangement === 'stack' || colHint <= 1) {
    return clampGridToLimits(drawerCount, 1, limits);
  }
  const cols = clampInt(colHint, 1, limits.maxCols);
  const rows = clampInt(Math.ceil(drawerCount / cols), 1, limits.maxRows);
  return clampGridToLimits(rows, cols, limits);
}

/** Resolve a full rows×columns drawer grid (no partial last row). */
export function resolveCabinetDrawerGrid(
  merged: FurnitureBuild,
  defaultDrawers: number,
  limits: CabinetDrawerGridLimits,
): CabinetDrawerGrid {
  const hasExplicit =
    merged.drawerRows != null ||
    merged.drawerColumns != null;

  const { rows, cols } = hasExplicit
    ? clampGridToLimits(
        merged.drawerRows ??
          Math.max(1, Math.ceil((merged.drawers ?? defaultDrawers) / (merged.drawerColumns ?? merged.columns ?? 1))),
        merged.drawerColumns ?? merged.columns ?? 1,
        limits,
      )
    : legacyGridFromMerged(merged, defaultDrawers, limits);

  return {
    drawerRows: rows,
    drawerColumns: cols,
    drawers: rows * cols,
    columns: cols,
  };
}

export function limitsForCabinetKind(kind: 'dresser' | 'nightstand' | 'desk', deskFront: boolean): CabinetDrawerGridLimits {
  if (kind === 'nightstand') {
    return { maxRows: 4, maxCols: 2, maxTotal: 4 };
  }
  if (kind === 'desk') {
    return deskFront
      ? { maxRows: 3, maxCols: 4, maxTotal: 6 }
      : { maxRows: 4, maxCols: 2, maxTotal: 4 };
  }
  return { maxRows: 8, maxCols: 4, maxTotal: 8 };
}
