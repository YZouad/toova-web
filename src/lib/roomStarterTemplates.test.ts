import { describe, expect, it } from 'vitest';
import { isValidFloorPlan, serializeFloorPlan } from './floorPlanGeometry';
import {
  getRoomStarterTemplate,
  materializeStarterItems,
  ROOM_STARTER_GOALS,
  ROOM_STARTER_TEMPLATES,
  ROOM_STARTER_TIERS,
  starterItemsBlockingDoors,
  starterPieceCount,
  starterPreviewItems,
  templatesForGoal,
  type RoomStarterGoal,
  type RoomStarterTier,
} from './roomStarterTemplates';
import { FURNITURE } from '../furniture/registry';

describe('roomStarterTemplates', () => {
  it('exposes the 3×3 goal × tier catalog plus a studio starter', () => {
    expect(ROOM_STARTER_GOALS.map((g) => g.id)).toEqual(['bedroom', 'office', 'living', 'studio']);
    expect(ROOM_STARTER_TIERS).toHaveLength(3);
    expect(ROOM_STARTER_TEMPLATES).toHaveLength(10);

    const ids = ROOM_STARTER_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const goal of ROOM_STARTER_GOALS.filter((g) => g.id !== 'studio')) {
      const forGoal = templatesForGoal(goal.id);
      expect(forGoal).toHaveLength(3);
      expect(forGoal.map((t) => t.tier).sort()).toEqual(['balanced', 'decorated', 'simple']);
    }
    expect(templatesForGoal('studio')).toHaveLength(1);
    expect(getRoomStarterTemplate('studio-simple')?.buildPlan().walls.length).toBeGreaterThan(4);
  });

  it('covers every bedroom/office/living × tier pair exactly once', () => {
    const seen = new Set<string>();
    for (const t of ROOM_STARTER_TEMPLATES.filter((t) => t.goal !== 'studio')) {
      const key = `${t.goal}:${t.tier}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
    for (const goal of ['bedroom', 'office', 'living'] as RoomStarterGoal[]) {
      for (const tier of ROOM_STARTER_TIERS.map((t) => t.id as RoomStarterTier)) {
        expect(seen.has(`${goal}:${tier}`)).toBe(true);
      }
    }
  });

  it('each template builds a valid plan and has furniture', () => {
    for (const template of ROOM_STARTER_TEMPLATES) {
      const plan = serializeFloorPlan(template.buildPlan());
      expect(isValidFloorPlan(plan), template.id).toBe(true);
      expect(template.floorItems.length, template.id).toBeGreaterThan(0);
      expect(starterPieceCount(template), template.id).toBeGreaterThan(0);
      expect(template.dimensionsLabel.length).toBeGreaterThan(0);
      expect(template.buildEnvironment().appearance.wallColor).toMatch(/^#/);
    }
  });

  it('piece count increases with tier within a fully populated goal', () => {
    for (const goal of ROOM_STARTER_GOALS.filter((g) => g.id !== 'studio')) {
      const [simple, balanced, decorated] = ['simple', 'balanced', 'decorated'].map(
        (tier) => ROOM_STARTER_TEMPLATES.find((t) => t.goal === goal.id && t.tier === tier)!,
      );
      expect(starterPieceCount(simple)).toBeLessThan(starterPieceCount(balanced));
      expect(starterPieceCount(balanced)).toBeLessThanOrEqual(starterPieceCount(decorated));
    }
  });

  it('materializeStarterItems assigns unique ids and attachment keys', () => {
    const template = getRoomStarterTemplate('bedroom-decorated');
    expect(template).toBeDefined();
    const plan = template!.buildPlan();
    const { items, order } = materializeStarterItems(template!, plan);
    expect(order).toEqual(items.map((it) => it.id));
    expect(new Set(items.map((it) => it.id)).size).toBe(items.length);
    expect(new Set(items.map((it) => it.attachmentKey)).size).toBe(items.length);
    expect(items.some((it) => it.kind === 'hanging')).toBe(true);
    const hanging = items.find((it) => it.kind === 'hanging');
    expect(hanging?.hanging?.anchors.every((a) => a.surface === 'wall')).toBe(true);
  });

  it('preview items omit hanging décor and match floor seeds', () => {
    const template = getRoomStarterTemplate('living-decorated')!;
    const preview = starterPreviewItems(template);
    expect(preview).toHaveLength(template.floorItems.length);
    expect(preview.every((p) => p.kind !== 'hanging')).toBe(true);
  });

  it('looks up templates by id', () => {
    expect(getRoomStarterTemplate('office-simple')?.label).toBe('Simple office');
    expect(getRoomStarterTemplate('studio-simple')?.label).toBe('Simple studio');
    expect(getRoomStarterTemplate('missing')).toBeUndefined();
  });

  it('sits lamps on the paired surface instead of the floor', () => {
    for (const template of ROOM_STARTER_TEMPLATES) {
      for (const seed of template.floorItems) {
        if (seed.kind !== 'lamp') continue;
        expect(seed.position[1], `${template.id} lamp y`).toBeGreaterThan(0);
        const surfaces = template.floorItems.filter(
          (s) => s.kind === 'nightstand' || s.kind === 'desk' || s.kind === 'dresser',
        );
        const onSurface = surfaces.some((s) => Math.abs(seed.position[1] - FURNITURE[s.kind].size[1]) < 0.01);
        expect(onSurface, `${template.id} lamp sits on a surface`).toBe(true);
      }
    }
  });

  it('does not place floor items in door openings', () => {
    for (const template of ROOM_STARTER_TEMPLATES) {
      expect(starterItemsBlockingDoors(template), template.id).toEqual([]);
    }
  });
});
