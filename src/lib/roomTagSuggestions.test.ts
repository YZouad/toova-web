import { describe, expect, it } from 'vitest';
import {
  defaultRectanglePlan,
  setZoneTag,
} from './floorPlanGeometry';
import { buildRoomTagSuggestions } from './roomTagSuggestions';
import type { Item } from '../store';

function item(partial: Partial<Item> & Pick<Item, 'id' | 'kind' | 'position'>): Item {
  return {
    rotationY: 0,
    size: [24, 24, 24],
    label: partial.kind,
    attachmentKey: partial.id,
    ...partial,
  };
}

describe('roomTagSuggestions', () => {
  it('reports missing essentials for a bedroom with no bed', () => {
    const plan = setZoneTag(defaultRectanglePlan(), 60, 90, 'bedroom');
    const report = buildRoomTagSuggestions(plan, []);
    expect(report.areas).toHaveLength(1);
    expect(report.areas[0]!.missingEssentials).toContain('bed');
    expect(report.areas[0]!.catalogCategories).toContain('beds');
  });

  it('marks essentials present when items sit in the tagged area', () => {
    const plan = setZoneTag(defaultRectanglePlan(), 60, 90, 'bedroom');
    const items = [
      item({ id: 'b1', kind: 'bed', position: [40, 0, 70] }),
      item({ id: 'n1', kind: 'nightstand', position: [70, 0, 70] }),
    ];
    const report = buildRoomTagSuggestions(plan, items);
    expect(report.areas[0]!.missingEssentials).toHaveLength(0);
    expect(report.areas[0]!.itemIds).toEqual(['b1', 'n1']);
  });
});
