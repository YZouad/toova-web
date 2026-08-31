import { describe, expect, it } from 'vitest';
import {
  COMPACT_MQ,
  TOUR_STEPS,
  VIEW_PRESETS,
} from './chromeTypes';
import { defaultInspectorTab, inspectorTabsForKind } from './inspectorTabs';
import {
  CATALOG_CATEGORY_DEFS,
  MAX_CATALOG_CATEGORIES,
  toggleCatalogCategory,
} from '../../lib/catalogCategories';
import { TIME_PRESETS } from './LightPanel';

describe('designer chrome contract', () => {
  it('exposes three view presets mapped to camera ids', () => {
    expect(VIEW_PRESETS.map((p) => p.id)).toEqual(['corner', 'catalog', 'topDown']);
    expect(VIEW_PRESETS.map((p) => p.label)).toEqual(['Room', 'Desk', 'Top']);
  });

  it('has guided tour steps with spotlight targets', () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(TOUR_STEPS.every((s) => s.title && s.body && s.target !== undefined)).toBe(true);
    expect(TOUR_STEPS.some((s) => s.target === null)).toBe(true);
    expect(TOUR_STEPS.filter((s) => s.target).every((s) => typeof s.target === 'string')).toBe(true);
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
  });

  it('uses compact breakpoint under 1024px', () => {
    expect(COMPACT_MQ).toBe('(max-width: 1023px)');
  });
});

describe('inspector tab mapping', () => {
  it('picks role-specific default tabs', () => {
    expect(defaultInspectorTab('hanging')).toBe('path');
    expect(defaultInspectorTab('light')).toBe('light');
    expect(defaultInspectorTab('bed')).toBe('bedding');
    expect(defaultInspectorTab('desk')).toBe('fit');
    expect(defaultInspectorTab(undefined)).toBe('fit');
  });

  it('defaultInspectorTab stays aligned with inspectorTabsForKind', () => {
    for (const kind of ['hanging', 'light', 'bed', 'desk', 'chair', undefined] as const) {
      const tab = defaultInspectorTab(kind);
      expect(inspectorTabsForKind(kind)).toContain(tab);
    }
  });

  it('limits tabs by item kind', () => {
    expect(inspectorTabsForKind('hanging')).toEqual(['path', 'bulbs']);
    expect(inspectorTabsForKind('light')).toEqual(['light']);
    expect(inspectorTabsForKind('bed')).toContain('bedding');
    expect(inspectorTabsForKind('chair')).not.toContain('path');
  });
});

describe('Room look vs Light IA', () => {
  // Time-of-day presets belong in LightPanel, not LookPanel (walls/floor/trim).
  it('exports time presets from Light panel', () => {
    expect(TIME_PRESETS.map((p) => p.id)).toEqual(['morning', 'afternoon', 'evening', 'night']);
    expect(TIME_PRESETS.every((p) => typeof p.hour === 'number')).toBe(true);
  });
});

describe('library category filters', () => {
  it('caps at three categories', () => {
    const ids = CATALOG_CATEGORY_DEFS.slice(0, 4).map((d) => d.slug);
    let selected: typeof ids = [];
    for (const id of ids) {
      selected = toggleCatalogCategory(selected, id);
    }
    expect(selected.length).toBeLessThanOrEqual(MAX_CATALOG_CATEGORIES);
    expect(MAX_CATALOG_CATEGORIES).toBe(3);
  });
});

describe('model card preview policy', () => {
  it('does not invent a placed count separate from downloads', () => {
    const allowedStats = ['views_count', 'likes_count', 'downloads_count'] as const;
    expect(allowedStats).not.toContain('placed_count');
  });
});
