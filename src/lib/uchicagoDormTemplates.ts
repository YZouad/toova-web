/**
 * UChicago residence-hall blank room starters.
 * Admins customize floor plans via Admin console → Starters.
 */

import { DEFAULT_ENVIRONMENT, type RoomEnvironment } from '../store';
import { DEFAULT_APPEARANCE } from './roomAppearance';
import { DOOR, inches } from '../units';
import {
  genId,
  planBounds,
  rectanglePlan,
  formatLength,
  type FloorPlan,
} from './floorPlanGeometry';
import type { RoomStarterTemplate } from './roomStarterTemplates';

export type UChicagoDormId =
  | 'woodlawn'
  | 'north'
  | 'max-p'
  | 'burton-judson'
  | 'i-house'
  | 'rennee-granville-grossman'
  | 'snell-hitchcock';

export type UChicagoLayoutType = 'single' | 'double' | 'pass-through';

export interface UChicagoDormMeta {
  dormId: UChicagoDormId;
  layout: UChicagoLayoutType;
}

export interface UChicagoDormDef {
  id: UChicagoDormId;
  label: string;
  layouts: readonly UChicagoLayoutType[];
}

export const UCHICAGO_LAYOUT_LABELS: Record<UChicagoLayoutType, string> = {
  single: 'Single',
  double: 'Double',
  'pass-through': 'BJ pass through',
};

export const UCHICAGO_DORMS: readonly UChicagoDormDef[] = [
  { id: 'woodlawn', label: 'Woodlawn', layouts: ['single', 'double'] },
  { id: 'north', label: 'North', layouts: ['single', 'double'] },
  { id: 'max-p', label: 'Max P', layouts: ['single', 'double'] },
  { id: 'burton-judson', label: 'Burton-Judson', layouts: ['single', 'double', 'pass-through'] },
  { id: 'i-house', label: 'I-House', layouts: ['single', 'double'] },
  {
    id: 'rennee-granville-grossman',
    label: 'Renee Granville-Grossman',
    layouts: ['single', 'double'],
  },
  { id: 'snell-hitchcock', label: 'Snell-Hitchcock', layouts: ['single', 'double'] },
];

function dimensionsLabelFor(plan: FloorPlan): string {
  const b = planBounds(plan);
  return `${formatLength(b.width, 'ft-in')} × ${formatLength(b.depth, 'ft-in')}`;
}

/** BJ pass-through double: doors on opposite ends so the room connects two hallways. */
function passThroughPlan(): FloorPlan {
  const width = inches(12, 0);
  const depth = inches(14, 0);
  const plan = rectanglePlan(width, depth, 96, false);
  const south = plan.walls[0]!;
  const north = plan.walls[2]!;
  const doorOffset = width / 2 - DOOR.width / 2;
  return {
    ...plan,
    openings: [
      {
        id: genId('o'),
        wallId: south.id,
        kind: 'door',
        offset: doorOffset,
        width: DOOR.width,
        height: DOOR.height,
        hinge: 'left',
      },
      {
        id: genId('o'),
        wallId: north.id,
        kind: 'door',
        offset: doorOffset,
        width: DOOR.width,
        height: DOOR.height,
        hinge: 'right',
      },
    ],
  };
}

function planForLayout(layout: UChicagoLayoutType): () => FloorPlan {
  switch (layout) {
    case 'single':
      return () => rectanglePlan(inches(10, 0), inches(12, 0), 96);
    case 'double':
      return () => rectanglePlan(inches(12, 0), inches(14, 0), 96);
    case 'pass-through':
      return passThroughPlan;
  }
}

function dormEnvironment(dormId: UChicagoDormId): RoomEnvironment {
  return {
    ...DEFAULT_ENVIRONMENT,
    timeOfDay: 14,
    appearance: {
      ...DEFAULT_APPEARANCE,
      wallColor: '#d8d0c2',
      floorPreset: dormId === 'woodlawn' ? 'charcoalCarpet' : 'lightOak',
    },
  };
}

function layoutDescription(layout: UChicagoLayoutType): string {
  if (layout === 'pass-through') {
    return 'Blank pass-through double with doors on both ends — furnish from scratch.';
  }
  return `Blank ${UCHICAGO_LAYOUT_LABELS[layout].toLowerCase()} room — draw walls and furnish from scratch.`;
}

function starterFor(dorm: UChicagoDormDef, layout: UChicagoLayoutType): RoomStarterTemplate {
  const buildPlan = planForLayout(layout);
  const plan = buildPlan();
  return {
    id: `uchicago-${dorm.id}-${layout}`,
    goal: 'uchicago',
    tier: 'simple',
    label: `${dorm.label} · ${UCHICAGO_LAYOUT_LABELS[layout]}`,
    description: layoutDescription(layout),
    dimensionsLabel: dimensionsLabelFor(plan),
    buildPlan,
    buildEnvironment: () => dormEnvironment(dorm.id),
    floorItems: [],
    dormMeta: { dormId: dorm.id, layout },
  };
}

/** One blank starter per dorm × layout combination. */
export function buildUChicagoDormStarters(): RoomStarterTemplate[] {
  const starters: RoomStarterTemplate[] = [];
  for (const dorm of UCHICAGO_DORMS) {
    for (const layout of dorm.layouts) {
      starters.push(starterFor(dorm, layout));
    }
  }
  return starters;
}

export function uChicagoLayoutLabel(layout: UChicagoLayoutType): string {
  return UCHICAGO_LAYOUT_LABELS[layout];
}

export function uChicagoDormLabel(dormId: UChicagoDormId): string {
  return UCHICAGO_DORMS.find((d) => d.id === dormId)?.label ?? dormId;
}

export function templatesForUChicagoDorm(
  templates: readonly RoomStarterTemplate[],
  dormId: UChicagoDormId,
): RoomStarterTemplate[] {
  return templates.filter((t) => t.goal === 'uchicago' && t.dormMeta?.dormId === dormId && !t.hidden);
}
