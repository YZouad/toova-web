import { describe, expect, it } from 'vitest';
import { isValidFloorPlan, serializeFloorPlan } from './floorPlanGeometry';
import {
  getRoomStarterTemplate,
  materializeStarterItems,
  ROOM_STARTER_GOALS,
  ROOM_STARTER_TEMPLATES,
  ROOM_STARTER_TIERS,
  starterPieceCount,
  starterPreviewItems,
  templatesForGoal,
  type RoomStarterGoal,
  type RoomStarterTier,
} from './roomStarterTemplates';

describe('roomStarterTemplates', () => {
  it('exposes a full 3×3 goal × tier catalog', () => {
    expect(ROOM_STARTER_GOALS).toHaveLength(3);
    expect(ROOM_STARTER_TIERS).toHaveLength(3);
    expect(ROOM_STARTER_TEMPLATES).toHaveLength(9);

    const ids = ROOM_STARTER_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const goal of ROOM_STARTER_GOALS) {
      const forGoal = templatesForGoal(goal.id);
      expect(forGoal).toHaveLength(3);
      expect(forGoal.map((t) => t.tier).sort()).toEqual(['balanced', 'decorated', 'simple']);
    }
  });

  it('covers every goal × tier pair exactly once', () => {
    const seen = new Set<string>();
    for (const t of ROOM_STARTER_TEMPLATES) {
      const key = `${t.goal}:${t.tier}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
    for (const goal of ROOM_STARTER_GOALS.map((g) => g.id as RoomStarterGoal)) {
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

  it('piece count increases with tier within a goal', () => {
    for (const goal of ROOM_STARTER_GOALS) {
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
    expect(getRoomStarterTemplate('missing')).toBeUndefined();
  });
});
