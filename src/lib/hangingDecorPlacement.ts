/**
 * Shared helpers for materializing procedural hanging décor (string lights, ivy).
 */

import { newAttachmentKey, type Item } from '../store';
import {
  DEFAULT_LEAF_CONFIG,
  DEFAULT_LIGHT_CONFIG,
  DEFAULT_LED_STRIP_CONFIG,
  type HangingDecorKind,
  type HangingDecorationConfig,
} from './hangingDecorGeometry';
import { getWallSegment, type FloorPlan } from './floorPlanGeometry';

export interface HangingPlacementSeed {
  kind: HangingDecorKind;
  wallIndex: number;
  offsetStart: number;
  offsetEnd: number;
  height: number;
  curatedProductId?: string;
}

const CONFIG_BY_KIND = {
  leaves: DEFAULT_LEAF_CONFIG,
  lights: DEFAULT_LIGHT_CONFIG,
  'led-strip': DEFAULT_LED_STRIP_CONFIG,
} as const;

/** Build hanging config from a wall span seed. */
export function resolveHangingConfig(
  plan: FloorPlan,
  seed: HangingPlacementSeed,
): HangingDecorationConfig | null {
  const wall = plan.walls[seed.wallIndex];
  if (!wall) return null;
  const base = CONFIG_BY_KIND[seed.kind];
  return {
    ...base,
    anchors: [
      {
        surface: 'wall',
        wallId: wall.id,
        offset: seed.offsetStart,
        height: seed.height,
      },
      {
        surface: 'wall',
        wallId: wall.id,
        offset: seed.offsetEnd,
        height: seed.height,
      },
    ],
    seed: (seed.wallIndex * 997 + Math.round(seed.offsetStart * 13)) >>> 0,
    palette: seed.kind === 'lights' ? [...base.palette] : [],
  };
}

export function hangingDecorLabel(kind: HangingDecorKind): string {
  if (kind === 'lights') return 'String lights';
  if (kind === 'led-strip') return 'LED strip';
  return 'Hanging leaves';
}

/** Create a store item for a resolved hanging config. */
export function hangingItemFromConfig(
  config: HangingDecorationConfig,
  id: string,
  label?: string,
  curatedProductId?: string,
): Item {
  return {
    id,
    kind: 'hanging',
    position: [0, 0, 0],
    rotationY: 0,
    size: [12, 12, 12],
    label: label ?? hangingDecorLabel(config.kind),
    attachmentKey: newAttachmentKey(),
    hanging: config,
    curatedProductId,
  };
}

/** Append hanging items from wall-span seeds. Returns new item ids in order. */
export function appendHangingFromSeeds(
  items: Item[],
  plan: FloorPlan,
  seeds: readonly HangingPlacementSeed[],
  nextIndex: { n: number },
): string[] {
  const added: string[] = [];
  for (const seed of seeds) {
    const config = resolveHangingConfig(plan, seed);
    if (!config) continue;
    const id = `item-${nextIndex.n++}`;
    items.push(
      hangingItemFromConfig(config, id, hangingDecorLabel(seed.kind), seed.curatedProductId),
    );
    added.push(id);
  }
  return added;
}

const WALL_INSET = 18;

function doorBlockedLength(plan: FloorPlan, wallIndex: number): number {
  const wall = plan.walls[wallIndex];
  if (!wall) return Infinity;
  const seg = getWallSegment(plan, wall);
  if (!seg) return 0;
  let blocked = 0;
  for (const opening of plan.openings) {
    if (opening.kind !== 'door' || opening.wallId !== wall.id) continue;
    blocked += opening.width + WALL_INSET * 2;
  }
  return Math.max(0, seg.length - blocked);
}

function spanOnWall(
  plan: FloorPlan,
  wallIndex: number,
  height: number,
): HangingPlacementSeed | null {
  const wall = plan.walls[wallIndex];
  if (!wall) return null;
  const seg = getWallSegment(plan, wall);
  if (!seg || seg.length < WALL_INSET * 2 + 24) return null;

  let start = WALL_INSET;
  let end = seg.length - WALL_INSET;

  for (const opening of plan.openings) {
    if (opening.kind !== 'door' || opening.wallId !== wall.id) continue;
    const doorStart = Math.max(0, opening.offset - WALL_INSET);
    const doorEnd = Math.min(seg.length, opening.offset + opening.width + WALL_INSET);
    if (doorStart <= start + 12) start = Math.max(start, doorEnd);
    if (doorEnd >= end - 12) end = Math.min(end, doorStart);
  }

  if (end - start < 24) return null;
  return {
    kind: 'lights',
    wallIndex,
    offsetStart: start,
    offsetEnd: end,
    height,
  };
}

/** Pick wall spans for agentic hanging décor after floor furniture is placed. */
export function pickAgenticHangingSeeds(
  plan: FloorPlan,
  hangingKinds: Array<{ kind: HangingDecorKind; curatedProductId?: string }>,
): HangingPlacementSeed[] {
  if (hangingKinds.length === 0) return [];

  const ranked = plan.walls
    .map((_, index) => ({ index, clear: doorBlockedLength(plan, index) }))
    .filter((w) => w.clear >= 48)
    .sort((a, b) => b.clear - a.clear);

  const seeds: HangingPlacementSeed[] = [];
  const usedWalls = new Set<number>();

  for (const entry of hangingKinds) {
    const height = entry.kind === 'leaves' ? 84 : 78;
    const wallPick =
      ranked.find((w) => !usedWalls.has(w.index)) ??
      ranked[0];
    if (!wallPick) continue;

    const span = spanOnWall(plan, wallPick.index, height);
    if (!span) continue;

    usedWalls.add(wallPick.index);
    seeds.push({
      ...span,
      kind: entry.kind,
      height,
      curatedProductId: entry.curatedProductId,
    });
  }

  return seeds;
}
