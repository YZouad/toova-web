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
  doorOpenings,
  formatLength,
  getWallSegment,
  lShapePlan,
  openingWorldPlacement,
  planBounds,
  rectanglePlan,
  wallById,
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

export type RoomStarterGoal = 'bedroom' | 'office' | 'living' | 'studio';
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
  hidden?: boolean;
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
  {
    id: 'studio',
    label: 'Studio',
    description: 'Sleep and work in one room',
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

const NIGHTSTAND_Y = FURNITURE.nightstand.size[1];
const DESK_Y = FURNITURE.desk.size[1];
const DRESSER_Y = FURNITURE.dresser.size[1];

/** Face +Z — into the room from the south (z = 0) wall. */
const FACE_IN_FROM_SOUTH = 0;
/** Face −Z — into the room from the north wall. */
const FACE_IN_FROM_NORTH = Math.PI;
/** Face −X — into the room from the east wall. */
const FACE_IN_FROM_EAST = -Math.PI / 2;
/** Face +X — into the room from the west wall. */
const FACE_IN_FROM_WEST = Math.PI / 2;

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
    floorItems: [
      bedItem([22, 0, 110], FACE_IN_FROM_SOUTH),
      item('nightstand', [48, 0, 78], FACE_IN_FROM_SOUTH),
    ],
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
      bedItem([22, 0, 110], FACE_IN_FROM_SOUTH, { blanketColor: '#7a8fa3' }),
      item('nightstand', [48, 0, 78], FACE_IN_FROM_SOUTH),
      item('lamp', [48, NIGHTSTAND_Y, 78], FACE_IN_FROM_SOUTH),
      item('dresser', [88, 0, 90], FACE_IN_FROM_EAST),
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
      bedItem([22, 0, 110], FACE_IN_FROM_SOUTH, { blanketColor: '#5c7a6a' }),
      item('nightstand', [48, 0, 78], FACE_IN_FROM_SOUTH),
      item('lamp', [48, NIGHTSTAND_Y, 78], FACE_IN_FROM_SOUTH),
      item('dresser', [88, 0, 70], FACE_IN_FROM_EAST),
      item('wardrobe', [88, 0, 140], FACE_IN_FROM_EAST),
      item('chair', [60, 0, 155], FACE_IN_FROM_NORTH),
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
      item('desk', [60, 0, 50], FACE_IN_FROM_SOUTH),
      item('chair', [60, 0, 78], FACE_IN_FROM_NORTH),
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
      item('desk', [60, 0, 50], FACE_IN_FROM_SOUTH),
      item('chair', [60, 0, 78], FACE_IN_FROM_NORTH),
      item('lamp', [42, DESK_Y, 50], FACE_IN_FROM_SOUTH),
      item('dresser', [105, 0, 70], FACE_IN_FROM_EAST, 'Filing storage'),
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
      item('desk', [55, 0, 50], FACE_IN_FROM_SOUTH),
      item('chair', [55, 0, 78], FACE_IN_FROM_NORTH),
      item('lamp', [38, DESK_Y, 50], FACE_IN_FROM_SOUTH),
      item('dresser', [105, 0, 50], FACE_IN_FROM_EAST, 'Filing storage'),
      item('wardrobe', [105, 0, 95], FACE_IN_FROM_EAST, 'Cabinet'),
      item('nightstand', [22, 0, 95], FACE_IN_FROM_WEST, 'Side table'),
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
      item('chair', [28, 0, 70], FACE_IN_FROM_WEST, 'Lounge chair'),
      item('dresser', [118, 0, 50], FACE_IN_FROM_SOUTH, 'Media console'),
      item('lamp', [118, DRESSER_Y, 50], FACE_IN_FROM_SOUTH),
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
      item('chair', [28, 0, 55], FACE_IN_FROM_WEST, 'Lounge chair'),
      item('chair', [28, 0, 90], FACE_IN_FROM_WEST, 'Lounge chair'),
      item('dresser', [118, 0, 50], FACE_IN_FROM_SOUTH, 'Media console'),
      item('desk', [80, 0, 100], FACE_IN_FROM_SOUTH, 'Coffee table'),
      item('lamp', [118, DRESSER_Y, 50], FACE_IN_FROM_SOUTH),
      item('nightstand', [50, 0, 140], FACE_IN_FROM_NORTH, 'Side table'),
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
      item('chair', [28, 0, 50], FACE_IN_FROM_WEST, 'Lounge chair'),
      item('chair', [28, 0, 85], FACE_IN_FROM_WEST, 'Lounge chair'),
      item('chair', [70, 0, 140], FACE_IN_FROM_NORTH, 'Accent chair'),
      item('dresser', [126, 0, 48], FACE_IN_FROM_SOUTH, 'Media console'),
      item('desk', [80, 0, 95], FACE_IN_FROM_SOUTH, 'Coffee table'),
      item('wardrobe', [126, 0, 130], FACE_IN_FROM_EAST, 'Cabinet'),
      item('lamp', [126, DRESSER_Y, 48], FACE_IN_FROM_SOUTH),
      item('nightstand', [50, 0, 145], FACE_IN_FROM_NORTH, 'Side table'),
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

  withMeta({
    id: 'studio-simple',
    goal: 'studio',
    tier: 'simple',
    label: 'Simple studio',
    description: 'An L-shaped room with a bed, desk, and lamp — sleep and work in one footprint.',
    buildPlan: () => lShapePlan(144, 144, 48, 48, ROOM.height),
    buildEnvironment: () =>
      env({
        timeOfDay: 13,
        appearance: appearance({ wallColor: '#d8d0c2', floorPreset: 'lightOak' }),
      }),
    floorItems: [
      bedItem([26, 0, 100], FACE_IN_FROM_SOUTH),
      item('nightstand', [52, 0, 72], FACE_IN_FROM_SOUTH),
      item('desk', [120, 0, 28], FACE_IN_FROM_SOUTH),
      item('chair', [120, 0, 54], FACE_IN_FROM_NORTH),
      item('lamp', [104, DESK_Y, 28], FACE_IN_FROM_SOUTH),
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

interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function aabbsOverlap(a: Aabb, b: Aabb): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function rotatedFootprintAabb(
  cx: number,
  cz: number,
  width: number,
  depth: number,
  rotationY: number,
): Aabb {
  const hw = width / 2;
  const hd = depth / 2;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const corners: Array<[number, number]> = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [lx, lz] of corners) {
    const x = cx + lx * c + lz * s;
    const z = cz - lx * s + lz * c;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

function doorOpeningAabb(plan: FloorPlan, opening: ReturnType<typeof doorOpenings>[number]): Aabb | null {
  const wall = wallById(plan, opening.wallId);
  if (!wall) return null;
  const seg = getWallSegment(plan, wall);
  const placed = openingWorldPlacement(plan, opening);
  if (!seg || !placed) return null;
  const [tx, tz] = seg.tangent;
  const inward: [number, number] = [-seg.outward[0], -seg.outward[1]];
  const half = opening.width / 2;
  const depth = ROOM.wallThickness + 24;
  const corners: Array<[number, number]> = [
    [-half, 0],
    [half, 0],
    [half, depth],
    [-half, depth],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [along, inw] of corners) {
    const x = placed.cx + tx * along + inward[0] * inw;
    const z = placed.cz + tz * along + inward[1] * inw;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

/** Floor-sitting starter pieces whose footprint intersects a door opening. */
export function starterItemsBlockingDoors(template: RoomStarterTemplate): StarterFloorSeed[] {
  const plan = template.buildPlan();
  const doors = doorOpenings(plan)
    .map((o) => doorOpeningAabb(plan, o))
    .filter((a): a is Aabb => a != null);
  if (doors.length === 0) return [];
  return template.floorItems.filter((seed) => {
    if (seed.position[1] > 1) return false;
    const def = FURNITURE[seed.kind];
    const box = rotatedFootprintAabb(
      seed.position[0],
      seed.position[2],
      def.size[0],
      def.size[2],
      seed.rotationY,
    );
    return doors.some((door) => aabbsOverlap(box, door));
  });
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
