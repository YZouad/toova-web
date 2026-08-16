/**
 * Curated new-room starters grouped by goal × furnishing tier.
 * Tiers describe composition density (not dollar estimates).
 */

import { FURNITURE, type FurnitureKind } from '../furniture/registry';
import {
  DEFAULT_BLANKET_COLOR,
  DEFAULT_ENVIRONMENT,
  newAttachmentKey,
  type Item,
  type RoomEnvironment,
} from '../store';
import {
  formatLength,
  lShapePlan,
  planBounds,
  rectanglePlan,
  type FloorPlan,
} from './floorPlanGeometry';
import {
  DEFAULT_LEAF_CONFIG,
  DEFAULT_LIGHT_CONFIG,
  type HangingDecorKind,
  type HangingDecorationConfig,
} from './hangingDecorGeometry';
import { DEFAULT_APPEARANCE, type RoomAppearance } from './roomAppearance';
import { ROOM } from '../units';

export type RoomStarterGoal = 'bedroom' | 'office' | 'living';
export type RoomStarterTier = 'simple' | 'balanced' | 'decorated';

export interface RoomStarterGoalDef {
  id: RoomStarterGoal;
  label: string;
  description: string;
}

export interface RoomStarterTierDef {
  id: RoomStarterTier;
  label: string;
  blurb: string;
}

/** Floor furniture seed (ids / attachment keys assigned at materialize time). */
export interface StarterFloorSeed {
  kind: Exclude<FurnitureKind, 'imported' | 'hanging' | 'light'>;
  label?: string;
  position: [number, number, number];
  rotationY: number;
  beddingEnabled?: boolean;
  blanketColor?: string;
}

/** Hanging décor resolved against the built floor plan’s wall list. */
export interface StarterHangingSeed {
  kind: HangingDecorKind;
  wallIndex: number;
  offsetStart: number;
  offsetEnd: number;
  height: number;
}

export interface RoomStarterTemplate {
  id: string;
  goal: RoomStarterGoal;
  tier: RoomStarterTier;
  label: string;
  description: string;
  /** Human-readable footprint, e.g. "8′ 5″ × 15′". */
  dimensionsLabel: string;
  buildPlan: () => FloorPlan;
  buildEnvironment: () => RoomEnvironment;
  floorItems: readonly StarterFloorSeed[];
  hanging?: readonly StarterHangingSeed[];
}

export const ROOM_STARTER_GOALS: readonly RoomStarterGoalDef[] = [
  {
    id: 'bedroom',
    label: 'Bedroom',
    description: 'Sleep and storage',
  },
  {
    id: 'office',
    label: 'Home office',
    description: 'Desk and focus',
  },
  {
    id: 'living',
    label: 'Living room',
    description: 'Lounge and gather',
  },
];

export const ROOM_STARTER_TIERS: readonly RoomStarterTierDef[] = [
  {
    id: 'simple',
    label: 'Simple',
    blurb: 'Essentials only — easy to rearrange.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    blurb: 'Core pieces plus comfort.',
  },
  {
    id: 'decorated',
    label: 'Decorated',
    blurb: 'Fuller styling to start from.',
  },
];

function dimensionsLabelFor(plan: FloorPlan): string {
  const b = planBounds(plan);
  const w = formatLength(b.maxX - b.minX, 'ft-in');
  const d = formatLength(b.maxZ - b.minZ, 'ft-in');
  return `${w} × ${d}`;
}

function appearance(partial: Partial<RoomAppearance>): RoomAppearance {
  return { ...DEFAULT_APPEARANCE, ...partial };
}

function env(partial?: Partial<RoomEnvironment>): RoomEnvironment {
  return {
    ...DEFAULT_ENVIRONMENT,
    ...partial,
    appearance: partial?.appearance
      ? appearance(partial.appearance)
      : { ...DEFAULT_APPEARANCE },
  };
}

function bedItem(
  position: [number, number, number],
  rotationY: number,
  extras?: Pick<StarterFloorSeed, 'beddingEnabled' | 'blanketColor' | 'label'>,
): StarterFloorSeed {
  return {
    kind: 'bed',
    position,
    rotationY,
    beddingEnabled: extras?.beddingEnabled ?? true,
    blanketColor: extras?.blanketColor ?? DEFAULT_BLANKET_COLOR,
    label: extras?.label,
  };
}

function item(
  kind: Exclude<FurnitureKind, 'imported' | 'hanging' | 'light' | 'bed'>,
  position: [number, number, number],
  rotationY = 0,
  label?: string,
): StarterFloorSeed {
  return { kind, position, rotationY, label };
}

/** Bedroom footprint — classic dorm/apartment rectangle. */
function bedroomPlan(): FloorPlan {
  return rectanglePlan(ROOM.width, ROOM.depth, ROOM.height);
}

/** Office footprint — compact square. */
function officePlan(): FloorPlan {
  return rectanglePlan(120, 120, ROOM.height);
}

/** Living footprint — wider lounge. */
function livingPlan(): FloorPlan {
  return rectanglePlan(144, 168, ROOM.height);
}

function withMeta(
  template: Omit<RoomStarterTemplate, 'dimensionsLabel'>,
): RoomStarterTemplate {
  return {
    ...template,
    dimensionsLabel: dimensionsLabelFor(template.buildPlan()),
  };
}

export const ROOM_STARTER_TEMPLATES: readonly RoomStarterTemplate[] = [
  // ── Bedroom ──────────────────────────────────────────────────────────────
  withMeta({
    id: 'bedroom-simple',
    goal: 'bedroom',
    tier: 'simple',
    label: 'Simple bedroom',
    description: 'Bed and a nightstand — the bare essentials.',
    buildPlan: bedroomPlan,
    buildEnvironment: () =>
      env({
        timeOfDay: 14,
        appearance: appearance({ wallColor: '#d8d0c2', floorPreset: 'lightOak' }),
      }),
    floorItems: [bedItem([28, 0, 55], 0), item('nightstand', [55, 0, 22], 0)],
  }),
  withMeta({
    id: 'bedroom-balanced',
    goal: 'bedroom',
    tier: 'balanced',
    label: 'Balanced bedroom',
    description: 'Sleep, storage, and a reading lamp.',
    buildPlan: bedroomPlan,
    buildEnvironment: () =>
      env({
        timeOfDay: 15,
        appearance: appearance({ wallColor: '#cfc7b8', floorPreset: 'lightOak' }),
      }),
    floorItems: [
      bedItem([28, 0, 55], 0, { blanketColor: '#7a8fa3' }),
      item('nightstand', [55, 0, 22], 0),
      item('dresser', [78, 0, 40], Math.PI / 2),
      item('lamp', [55, 0, 40], 0),
    ],
  }),
  withMeta({
    id: 'bedroom-decorated',
    goal: 'bedroom',
    tier: 'decorated',
    label: 'Decorated bedroom',
    description: 'Full bedroom with wardrobe, seating, and string lights.',
    buildPlan: bedroomPlan,
    buildEnvironment: () =>
      env({
        timeOfDay: 19,
        appearance: appearance({
          wallColor: '#6b7f6a',
          floorPreset: 'lightOak',
          recessedLights: true,
        }),
      }),
    floorItems: [
      bedItem([28, 0, 55], 0, { blanketColor: '#5c7a6a' }),
      item('nightstand', [55, 0, 22], 0),
      item('dresser', [78, 0, 40], Math.PI / 2),
      item('wardrobe', [78, 0, 130], Math.PI / 2),
      item('lamp', [55, 0, 40], 0),
      item('chair', [55, 0, 150], Math.PI),
    ],
    hanging: [
      {
        kind: 'lights',
        wallIndex: 0,
        offsetStart: 18,
        offsetEnd: 78,
        height: 78,
      },
    ],
  }),

  // ── Home office ──────────────────────────────────────────────────────────
  withMeta({
    id: 'office-simple',
    goal: 'office',
    tier: 'simple',
    label: 'Simple office',
    description: 'Desk and chair — ready to work.',
    buildPlan: officePlan,
    buildEnvironment: () =>
      env({
        timeOfDay: 11,
        appearance: appearance({ wallColor: '#f2efe8', floorPreset: 'concrete' }),
      }),
    floorItems: [
      item('desk', [60, 0, 30], 0),
      item('chair', [60, 0, 55], Math.PI),
    ],
  }),
  withMeta({
    id: 'office-balanced',
    goal: 'office',
    tier: 'balanced',
    label: 'Balanced office',
    description: 'Workspace with storage and task lighting.',
    buildPlan: officePlan,
    buildEnvironment: () =>
      env({
        timeOfDay: 12,
        appearance: appearance({ wallColor: '#cfc7b8', floorPreset: 'concrete' }),
      }),
    floorItems: [
      item('desk', [60, 0, 30], 0),
      item('chair', [60, 0, 55], Math.PI),
      item('lamp', [35, 0, 28], 0),
      item('dresser', [100, 0, 70], Math.PI / 2, 'Filing storage'),
    ],
  }),
  withMeta({
    id: 'office-decorated',
    goal: 'office',
    tier: 'decorated',
    label: 'Decorated office',
    description: 'Full studio desk setup with cabinets and hanging leaves.',
    buildPlan: officePlan,
    buildEnvironment: () =>
      env({
        timeOfDay: 16,
        appearance: appearance({
          wallColor: '#1f4f4f',
          floorPreset: 'concrete',
        }),
      }),
    floorItems: [
      item('desk', [55, 0, 30], 0),
      item('chair', [55, 0, 55], Math.PI),
      item('lamp', [30, 0, 28], 0),
      item('dresser', [100, 0, 50], Math.PI / 2, 'Filing storage'),
      item('wardrobe', [100, 0, 95], Math.PI / 2, 'Cabinet'),
      item('nightstand', [30, 0, 95], 0, 'Side table'),
    ],
    hanging: [
      {
        kind: 'leaves',
        wallIndex: 0,
        offsetStart: 20,
        offsetEnd: 90,
        height: 84,
      },
    ],
  }),

  // ── Living room ──────────────────────────────────────────────────────────
  // Built-ins lack sofa/coffee-table kinds; we relabel chairs + dresser/desk
  // as lounge seating and console pieces until dedicated assets exist.
  withMeta({
    id: 'living-simple',
    goal: 'living',
    tier: 'simple',
    label: 'Simple living room',
    description: 'Lounge seating and a low console.',
    buildPlan: livingPlan,
    buildEnvironment: () =>
      env({
        timeOfDay: 14,
        appearance: appearance({ wallColor: '#d8d0c2', floorPreset: 'lightOak' }),
      }),
    floorItems: [
      item('chair', [40, 0, 50], Math.PI / 2, 'Lounge chair'),
      item('dresser', [100, 0, 30], 0, 'Media console'),
      item('lamp', [55, 0, 30], 0),
    ],
  }),
  withMeta({
    id: 'living-balanced',
    goal: 'living',
    tier: 'balanced',
    label: 'Balanced living room',
    description: 'Seating for two, console, and a side table.',
    buildPlan: livingPlan,
    buildEnvironment: () =>
      env({
        timeOfDay: 15,
        appearance: appearance({ wallColor: '#cfc7b8', floorPreset: 'lightOak' }),
      }),
    floorItems: [
      item('chair', [36, 0, 45], Math.PI / 2, 'Lounge chair'),
      item('chair', [36, 0, 75], Math.PI / 2, 'Lounge chair'),
      item('dresser', [110, 0, 30], 0, 'Media console'),
      item('desk', [80, 0, 90], 0, 'Coffee table'),
      item('lamp', [55, 0, 30], 0),
      item('nightstand', [55, 0, 120], 0, 'Side table'),
    ],
  }),
  withMeta({
    id: 'living-decorated',
    goal: 'living',
    tier: 'decorated',
    label: 'Decorated living room',
    description: 'Lounge set with storage, lighting, and string lights.',
    buildPlan: livingPlan,
    buildEnvironment: () =>
      env({
        timeOfDay: 18,
        appearance: appearance({
          wallColor: '#3a3a3a',
          floorPreset: 'lightOak',
          recessedLights: true,
        }),
      }),
    floorItems: [
      item('chair', [36, 0, 40], Math.PI / 2, 'Lounge chair'),
      item('chair', [36, 0, 70], Math.PI / 2, 'Lounge chair'),
      item('chair', [70, 0, 110], Math.PI, 'Accent chair'),
      item('dresser', [118, 0, 28], 0, 'Media console'),
      item('desk', [80, 0, 80], 0, 'Coffee table'),
      item('wardrobe', [118, 0, 120], Math.PI / 2, 'Cabinet'),
      item('lamp', [55, 0, 28], 0),
      item('nightstand', [55, 0, 130], 0, 'Side table'),
    ],
    hanging: [
      {
        kind: 'lights',
        wallIndex: 0,
        offsetStart: 24,
        offsetEnd: 110,
        height: 80,
      },
    ],
  }),
];

/** Blank shape presets kept for the “Blank room” path. */
export type BlankPlanPresetId = 'rectangle' | 'square' | 'l-shape';

export interface BlankPlanPreset {
  id: BlankPlanPresetId;
  label: string;
  description: string;
  dimensionsLabel: string;
  build: () => FloorPlan;
}

function blankWithDimensions(
  preset: Omit<BlankPlanPreset, 'dimensionsLabel'>,
): BlankPlanPreset {
  return {
    ...preset,
    dimensionsLabel: dimensionsLabelFor(preset.build()),
  };
}

export const BLANK_PLAN_PRESETS: readonly BlankPlanPreset[] = [
  blankWithDimensions({
    id: 'rectangle',
    label: 'Rectangle',
    description: 'A classic rectangular room with a door and window.',
    build: () => rectanglePlan(ROOM.width, ROOM.depth, ROOM.height),
  }),
  blankWithDimensions({
    id: 'square',
    label: 'Square',
    description: 'An even square footprint — easy to furnish.',
    build: () => rectanglePlan(120, 120, ROOM.height),
  }),
  blankWithDimensions({
    id: 'l-shape',
    label: 'L-shape',
    description: 'An L-shaped layout with a door on the long wall.',
    build: () => lShapePlan(120, 120, 48, 48, ROOM.height),
  }),
];

export function getRoomStarterTemplate(id: string): RoomStarterTemplate | undefined {
  return ROOM_STARTER_TEMPLATES.find((t) => t.id === id);
}

export function templatesForGoal(goal: RoomStarterGoal): RoomStarterTemplate[] {
  return ROOM_STARTER_TEMPLATES.filter((t) => t.goal === goal);
}

export function getBlankPlanPreset(id: BlankPlanPresetId): BlankPlanPreset | undefined {
  return BLANK_PLAN_PRESETS.find((p) => p.id === id);
}

export function starterTierLabel(tier: RoomStarterTier): string {
  return ROOM_STARTER_TIERS.find((t) => t.id === tier)?.label ?? tier;
}

export function starterPieceCount(template: RoomStarterTemplate): number {
  return template.floorItems.length + (template.hanging?.length ?? 0);
}

function resolveHanging(
  plan: FloorPlan,
  seed: StarterHangingSeed,
): HangingDecorationConfig | null {
  const wall = plan.walls[seed.wallIndex];
  if (!wall) return null;
  const base = seed.kind === 'lights' ? DEFAULT_LIGHT_CONFIG : DEFAULT_LEAF_CONFIG;
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

function floorSeedToItem(seed: StarterFloorSeed, id: string): Item {
  const def = FURNITURE[seed.kind];
  const isBed = seed.kind === 'bed';
  const bedLegHeight = isBed ? 8 : undefined;
  const size: [number, number, number] = isBed
    ? [def.size[0], (bedLegHeight ?? 8) + def.size[1], def.size[2]]
    : ([...def.size] as [number, number, number]);

  return {
    id,
    kind: seed.kind,
    position: [...seed.position] as [number, number, number],
    rotationY: seed.rotationY,
    size,
    bedLegHeight,
    label: seed.label ?? def.label,
    beddingEnabled: isBed ? (seed.beddingEnabled ?? true) : undefined,
    blanketColor: isBed ? (seed.blanketColor ?? DEFAULT_BLANKET_COLOR) : undefined,
    attachmentKey: newAttachmentKey(),
  };
}

/** Build editable store items from a template + freshly built plan (for hanging wall ids). */
export function materializeStarterItems(
  template: RoomStarterTemplate,
  plan: FloorPlan,
): { items: Item[]; order: string[] } {
  const items: Item[] = [];
  let n = 1;

  for (const seed of template.floorItems) {
    const id = `item-${n++}`;
    items.push(floorSeedToItem(seed, id));
  }

  for (const hang of template.hanging ?? []) {
    const config = resolveHanging(plan, hang);
    if (!config) continue;
    const id = `item-${n++}`;
    items.push({
      id,
      kind: 'hanging',
      position: [0, 0, 0],
      rotationY: 0,
      size: [12, 12, 12],
      label: hang.kind === 'lights' ? 'String lights' : 'Hanging leaves',
      attachmentKey: newAttachmentKey(),
      hanging: config,
    });
  }

  return { items, order: items.map((it) => it.id) };
}

/** Preview-friendly item snapshots (no attachment keys needed). */
export function starterPreviewItems(template: RoomStarterTemplate): Array<{
  id: string;
  kind: string;
  position: [number, number, number];
  rotationY: number;
  size: [number, number, number];
}> {
  return template.floorItems.map((seed, i) => {
    const def = FURNITURE[seed.kind];
    const isBed = seed.kind === 'bed';
    const size: [number, number, number] = isBed
      ? [def.size[0], 8 + def.size[1], def.size[2]]
      : ([...def.size] as [number, number, number]);
    return {
      id: `preview-${template.id}-${i}`,
      kind: seed.kind,
      position: [...seed.position] as [number, number, number],
      rotationY: seed.rotationY,
      size,
    };
  });
}
