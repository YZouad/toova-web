import { describe, expect, it } from 'vitest';
import {
  areaProgress,
  budgetFit,
  cardBadges,
  dedupeCommunityModels,
  disambiguateAreaLabels,
  forYouModels,
  formatModelDims,
  inRoomCounts,
  pairsFor,
  popularRank,
  prepareShowroomRails,
  recentModels,
} from './showroomSignals';
import type { CatalogModel } from '../chromeTypes';
import type { AreaSuggestion } from '../../../lib/roomTagSuggestions';
import type { Item } from '../../../store';

function model(partial: Partial<CatalogModel> & { kind: string }): CatalogModel {
  return {
    label: partial.kind,
    description: null,
    tags: [],
    categories: [],
    width_in: 10,
    height_in: 10,
    depth_in: 10,
    clearance_in: null,
    userId: null,
    visibility: 'public',
    isBuiltin: true,
    likesCount: 0,
    downloadsCount: 0,
    viewsCount: 0,
    createdAt: '2020-01-01T00:00:00Z',
    creatorHandle: null,
    creatorDisplayName: null,
    likedByMe: false,
    hotScore: 0,
    storagePath: '',
    signedUrl: null,
    previewUrl: null,
    ...partial,
  };
}

describe('inRoomCounts', () => {
  it('counts by catalogKind then kind', () => {
    const items: Record<string, Item | undefined> = {
      a: { id: 'a', kind: 'desk', catalogKind: 'desk-pro' } as Item,
      b: { id: 'b', kind: 'desk', catalogKind: 'desk-pro' } as Item,
      c: { id: 'c', kind: 'chair' } as Item,
    };
    const map = inRoomCounts(items);
    expect(map.get('desk-pro')).toBe(2);
    expect(map.get('chair')).toBe(1);
    expect(map.get('desk')).toBeUndefined();
  });
});

describe('popularRank', () => {
  it('only ranks top 3 on hot', () => {
    expect(popularRank(0, 'hot')).toBe(1);
    expect(popularRank(2, 'hot')).toBe(3);
    expect(popularRank(3, 'hot')).toBeNull();
    expect(popularRank(0, 'newest')).toBeNull();
  });
});

describe('budgetFit', () => {
  it('reports fits / over / unknown', () => {
    expect(budgetFit(1000, 5000).kind).toBe('fits');
    expect(budgetFit(6000, 5000)).toEqual({ kind: 'over', overLabel: '$10' });
    expect(budgetFit(null, 5000).kind).toBe('unknown');
    expect(budgetFit(1000, null).kind).toBe('unknown');
  });
});

describe('areaProgress', () => {
  it('summarizes essentials', () => {
    const suggestion = {
      label: 'Bedroom',
      presentEssentials: ['bed'],
      missingEssentials: ['nightstand'],
    } as AreaSuggestion;
    const p = areaProgress(suggestion);
    expect(p).toEqual({
      label: 'Bedroom',
      present: 1,
      total: 2,
      complete: false,
      missing: ['nightstand'],
    });
    expect(areaProgress(null)).toBeNull();
  });
});

describe('disambiguateAreaLabels', () => {
  it('numbers duplicate labels', () => {
    const areas = [
      { faceKey: 'a', label: 'Bedroom', name: null },
      { faceKey: 'b', label: 'Bedroom', name: null },
      { faceKey: 'c', label: 'Kitchen', name: 'Galley' },
    ] as AreaSuggestion[];
    const map = disambiguateAreaLabels(areas);
    expect(map.get('a')).toBe('Bedroom 1');
    expect(map.get('b')).toBe('Bedroom 2');
    expect(map.get('c')).toBe('Galley');
  });
});

describe('pairsFor / forYou / recent / rails', () => {
  const desk = model({ kind: 'desk', categories: ['desks_workspaces'], downloadsCount: 5 });
  const chair = model({ kind: 'chair', categories: ['seating'], downloadsCount: 9 });
  const lamp = model({ kind: 'lamp', categories: ['lighting'], downloadsCount: 2 });
  const bed = model({ kind: 'bed', categories: ['beds'], downloadsCount: 1 });
  const sofa = model({ kind: 'sofa', categories: ['seating'], downloadsCount: 8 });
  const stool = model({ kind: 'stool', categories: ['seating'], downloadsCount: 3 });
  const ottoman = model({ kind: 'ottoman', categories: ['seating'], downloadsCount: 4 });

  it('pairs desks with seating then lighting by primary category', () => {
    const pairs = pairsFor(desk, [desk, chair, lamp, bed]);
    expect(pairs.map((m) => m.kind)).toEqual(['chair', 'lamp']);
  });

  it('fills partner categories in priority order (kitchen before storage)', () => {
    const stove = model({ kind: 'stove', categories: ['appliances'] });
    const wardrobe = model({ kind: 'wardrobe', categories: ['storage'], downloadsCount: 99 });
    const pan = model({ kind: 'pan', categories: ['kitchen'], downloadsCount: 1 });
    const fridge = model({ kind: 'fridge', categories: ['kitchen'], downloadsCount: 2 });
    const multi = model({
      kind: 'shelf-kitchen',
      categories: ['storage', 'kitchen'],
      downloadsCount: 50,
    });
    const pairs = pairsFor(stove, [stove, wardrobe, pan, fridge, multi]);
    // kitchen partners first (primary category only), then storage
    expect(pairs.map((m) => m.kind)).toEqual(['pan', 'fridge', 'wardrobe', 'shelf-kitchen']);
    const withMulti = pairsFor(stove, [stove, wardrobe, multi], 4);
    expect(withMulti.map((m) => m.kind)).toEqual(['wardrobe', 'shelf-kitchen']);
  });

  it('requires primary category for for-you', () => {
    const multi = model({
      kind: 'desk-lamp',
      categories: ['lighting', 'desks_workspaces'],
      downloadsCount: 20,
    });
    // lighting is primary — should match lighting area, not desks
    expect(forYouModels([multi, chair], ['desks_workspaces']).map((m) => m.kind)).toEqual([]);
    expect(forYouModels([multi, chair], ['lighting']).map((m) => m.kind)).toEqual(['desk-lamp']);
  });

  it('preserves recent order', () => {
    expect(recentModels([desk, chair, lamp], ['lamp', 'desk']).map((m) => m.kind)).toEqual([
      'lamp',
      'desk',
    ]);
  });

  it('hides rails on mine and enforces min count + dedupe', () => {
    const models = [desk, chair, lamp, bed, sofa, stool, ottoman];
    const empty = prepareShowroomRails({
      models,
      areaCategories: ['seating'],
      recentKinds: ['desk', 'chair', 'lamp'],
      source: 'mine',
    });
    expect(empty).toEqual({ forYou: [], newWeek: [], recent: [] });

    const rails = prepareShowroomRails({
      models,
      areaCategories: ['seating'],
      recentKinds: ['desk', 'chair', 'lamp', 'sofa'],
      source: 'toova',
      excludeKinds: ['chair'], // first grid row
      minCount: 3,
    });
    // seating primary: sofa, stool, ottoman (chair excluded)
    expect(rails.forYou.map((m) => m.kind)).toEqual(['sofa', 'ottoman', 'stool']);
    expect(rails.forYou).toHaveLength(3);
  });
});

describe('cardBadges / formatModelDims', () => {
  it('shows at most one badge, preferring rank then in-room', () => {
    const b = cardBadges({ rank: 1, isNew: true, placedCount: 1200, inRoom: 2 });
    expect(b.visible).toHaveLength(1);
    expect(b.visible[0]?.label).toBe('#1 Popular');
    expect(b.title).toContain('In your room');
  });

  it('hides low place counts and prefers in-room over new', () => {
    const low = cardBadges({ rank: null, isNew: true, placedCount: 2, inRoom: 0 });
    expect(low.visible).toEqual([{ key: 'new', label: 'New', className: 'dgl-badge--new' }]);
    const owned = cardBadges({ rank: null, isNew: true, placedCount: 2, inRoom: 1 });
    expect(owned.visible[0]?.key).toBe('owned');
    const placed = cardBadges({ rank: null, isNew: false, placedCount: 12, inRoom: 0 });
    expect(placed.visible[0]?.label).toMatch(/placed$/);
  });

  it('formats W×D×H', () => {
    expect(formatModelDims({ width_in: 38.2, depth_in: 75.1, height_in: 14 })).toBe(
      '38″W × 75″D × 14″H',
    );
  });
});

describe('dedupeCommunityModels', () => {
  it('keeps builtins and drops matching community dupes', () => {
    const a = model({
      kind: 'a',
      label: 'Monitor',
      isBuiltin: false,
      userId: 'u1',
      width_in: 15,
      height_in: 25,
      depth_in: 2,
    });
    const b = model({
      kind: 'b',
      label: 'Monitor',
      isBuiltin: false,
      userId: 'u1',
      width_in: 15.2,
      height_in: 25.1,
      depth_in: 2.4,
    });
    const builtin = model({ kind: 'desk', label: 'Desk', isBuiltin: true });
    expect(dedupeCommunityModels([a, b, builtin]).map((m) => m.kind)).toEqual(['a', 'desk']);
  });
});
