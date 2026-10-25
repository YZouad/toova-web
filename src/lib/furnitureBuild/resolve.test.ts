import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../../furniture/registry';
import { applyBuildSizeOverride, resolveFurnitureBuild, resolveFurnitureBuildExplicit } from './resolve';

describe('resolveFurnitureBuild', () => {
  it('returns undefined for default dresser', () => {
    expect(resolveFurnitureBuild('dresser', 'dresser', {})).toBeUndefined();
  });

  it('sniffs drawer count from query as a vertical stack', () => {
    expect(resolveFurnitureBuild('dresser', '6 drawer dresser', null)).toEqual({
      drawers: 6,
      drawerRows: 6,
      drawerColumns: 1,
      columns: 1,
    });
  });

  it('explicit resolve ignores label sniffing', () => {
    expect(resolveFurnitureBuildExplicit('dresser', { drawerRows: 2, drawerColumns: 1 })).toEqual({
      drawers: 2,
      drawerRows: 2,
      drawerColumns: 1,
      columns: 1,
    });
  });

  it('wide arrangement puts drawers in one row', () => {
    expect(
      resolveFurnitureBuildExplicit('dresser', {
        drawers: 3,
        drawerArrangement: 'wide',
      }),
    ).toEqual({
      drawers: 3,
      drawerRows: 1,
      drawerColumns: 3,
      columns: 3,
    });
  });

  it('sniffs wide drawer phrasing', () => {
    expect(resolveFurnitureBuild('dresser', 'dresser with 2 wide drawers', null)).toEqual({
      drawers: 2,
      drawerRows: 1,
      drawerColumns: 2,
      columns: 2,
    });
  });

  it('clamps dresser drawer grid to max total', () => {
    expect(resolveFurnitureBuild('dresser', 'x', { drawerRows: 4, drawerColumns: 4 })).toEqual({
      drawers: 8,
      drawerRows: 2,
      drawerColumns: 4,
      columns: 4,
    });
  });

  it('parses desk pedestal from query', () => {
    expect(resolveFurnitureBuild('desk', 'desk with drawers on the left', null)).toEqual({
      deskPedestal: 'left',
      drawers: 3,
      drawerRows: 3,
      drawerColumns: 1,
      columns: 1,
    });
  });

  it('parses desk under-drawer and legacy center pedestal', () => {
    expect(resolveFurnitureBuild('desk', 'desk with drawers underneath', null)).toEqual({
      deskPullOut: 'center',
    });
    expect(
      resolveFurnitureBuildExplicit('desk', { deskPedestal: 'center' }),
    ).toEqual({
      deskPullOut: 'center',
    });
    expect(resolveFurnitureBuild('desk', 'writing desk with front drawers', null)).toEqual({
      deskPullOut: 'front',
    });
  });

  it('allows side cabinets and under-drawer together', () => {
    expect(
      resolveFurnitureBuildExplicit('desk', {
        deskPedestal: 'both',
        deskPullOut: 'front',
        pullOutWidthIn: 30,
      }),
    ).toEqual({
      deskPedestal: 'both',
      deskPullOut: 'front',
      pullOutWidthIn: 30,
      drawers: 3,
      drawerRows: 3,
      drawerColumns: 1,
      columns: 1,
    });
  });

  it('parses bookshelf shelves', () => {
    expect(resolveFurnitureBuild('bookshelf', '5 shelf bookcase', null)).toEqual({
      shelves: 5,
      bookshelfColumns: 1,
      back: true,
    });
  });

  it('parses armchair', () => {
    expect(resolveFurnitureBuild('chair', 'upholstered armchair', null)).toEqual({
      style: 'armchair',
      backStyle: 'solid',
    });
  });
});

describe('applyBuildSizeOverride', () => {
  it('widens armchair default', () => {
    const base = [...FURNITURE.chair.size] as [number, number, number];
    const next = applyBuildSizeOverride('chair', base, { style: 'armchair' });
    expect(next[0]).toBeGreaterThan(base[0]);
  });

  it('stacks shelf boards into height', () => {
    const base = [...FURNITURE.shelf.size] as [number, number, number];
    const next = applyBuildSizeOverride('shelf', base, { boards: 3, gap: 10 });
    expect(next[1]).toBeGreaterThan(base[1]);
  });
});
