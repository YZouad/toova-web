/**
 * UChicago residence-hall blank room starters.
 * Admins customize floor plans via Admin console → Starters.
 */

import { DEFAULT_ENVIRONMENT, type RoomEnvironment } from '../store';
import { DEFAULT_APPEARANCE } from './roomAppearance';
import { inches } from '../units';
import { planBounds, rectanglePlan, formatLength, type FloorPlan } from './floorPlanGeometry';
import type { RoomStarterTemplate } from './roomStarterTemplates';

export type UChicagoDormId =
  | 'woodlawn'
  | 'north'
  | 'max-p'
  | 'burton-judson'
  | 'i-house'
  | 'rennee-granville-grossman'
  | 'snell-hitchcock';

export type UChicagoLayoutType = 'single' | 'double' | 'apartment';

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
  apartment: 'Apartment',
};

export const UCHICAGO_DORMS: readonly UChicagoDormDef[] = [
  { id: 'woodlawn', label: 'Woodlawn', layouts: ['single', 'double', 'apartment'] },
  { id: 'north', label: 'North', layouts: ['single', 'double', 'apartment'] },
  { id: 'max-p', label: 'Max P', layouts: ['single', 'double'] },
  { id: 'burton-judson', label: 'Burton-Judson', layouts: ['single', 'double'] },
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

function planForLayout(layout: UChicagoLayoutType): () => FloorPlan {
  switch (layout) {
    case 'single':
      return () => rectanglePlan(inches(10, 0), inches(12, 0), 96);
    case 'double':
      return () => rectanglePlan(inches(12, 0), inches(14, 0), 96);
    case 'apartment':
      return () => rectanglePlan(inches(14, 0), inches(16, 0), 96);
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

function starterFor(dorm: UChicagoDormDef, layout: UChicagoLayoutType): RoomStarterTemplate {
  const buildPlan = planForLayout(layout);
  const plan = buildPlan();
  return {
    id: `uchicago-${dorm.id}-${layout}`,
    goal: 'uchicago',
    tier: 'simple',
    label: `${dorm.label} · ${UCHICAGO_LAYOUT_LABELS[layout]}`,
    description: `Blank ${UCHICAGO_LAYOUT_LABELS[layout].toLowerCase()} room — draw walls and furnish from scratch.`,
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
