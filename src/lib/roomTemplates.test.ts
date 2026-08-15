import { describe, expect, it } from 'vitest';
import { isValidFloorPlan, planBounds, serializeFloorPlan } from './floorPlanGeometry';
import {
  ROOM_TEMPLATES,
  buildTemplateItems,
  getRoomTemplate,
} from './roomTemplates';
import { FURNITURE } from '../furniture/registry';

describe('roomTemplates', () => {
  it('exposes three furnished starter packages', () => {
    expect(ROOM_TEMPLATES).toHaveLength(3);
    expect(ROOM_TEMPLATES.map((t) => t.id)).toEqual([
      'balanced-dorm',
      'study-first',
      'storage-first',
    ]);
  });

  it('each template builds a valid plan with furniture inside bounds', () => {
    for (const template of ROOM_TEMPLATES) {
      const plan = serializeFloorPlan(template.buildPlan());
      expect(isValidFloorPlan(plan), template.id).toBe(true);
      const bounds = planBounds(plan);
      const { items, order } = buildTemplateItems(template);
      expect(order.length).toBeGreaterThan(0);
      expect(items).toHaveLength(order.length);
      for (const item of items) {
        expect(item.kind in FURNITURE || item.kind === 'imported').toBe(true);
        expect(item.position[0]).toBeGreaterThanOrEqual(bounds.minX);
        expect(item.position[0]).toBeLessThanOrEqual(bounds.maxX);
        expect(item.position[2]).toBeGreaterThanOrEqual(bounds.minZ);
        expect(item.position[2]).toBeLessThanOrEqual(bounds.maxZ);
        expect(item.attachmentKey.length).toBeGreaterThan(0);
      }
      expect(template.essentialProductSlugs.length).toBeGreaterThan(0);
    }
  });

  it('looks up templates by id', () => {
    expect(getRoomTemplate('study-first')?.label).toBe('Study-first');
    expect(getRoomTemplate('missing' as 'balanced-dorm')).toBeUndefined();
  });

  it('buildTemplateItems returns fresh attachment keys each call', () => {
    const template = getRoomTemplate('balanced-dorm')!;
    const a = buildTemplateItems(template);
    const b = buildTemplateItems(template);
    expect(a.items[0]?.attachmentKey).not.toBe(b.items[0]?.attachmentKey);
  });
});
