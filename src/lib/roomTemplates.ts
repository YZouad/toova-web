/**
 * Pre-designed, editable room packages for onboarding.
 * Geometry + furniture live in the client; essentials map to curated product slugs.
 */

import { FURNITURE, type FurnitureKind } from '../furniture/registry';
import { newAttachmentKey, type Item, type RoomEnvironment } from '../store';
import { DEFAULT_ENVIRONMENT } from '../store';
import { rectanglePlan, type FloorPlan } from './floorPlanGeometry';
import { DEFAULT_APPEARANCE, type RoomAppearance } from './roomAppearance';
import { ROOM } from '../units';

export type RoomTemplateId = 'balanced-dorm' | 'study-first' | 'storage-first';

export interface RoomTemplateFurnitureSeed {
  kind: Exclude<FurnitureKind, 'imported' | 'hanging'>;
  /** World XZ center of the footprint; Y is floor. */
  position: [number, number, number];
  rotationY?: number;
  label?: string;
  beddingEnabled?: boolean;
}

export interface RoomTemplate {
  id: RoomTemplateId;
  label: string;
  tagline: string;
  description: string;
  /** Curated product slugs for simple supplies (hooks, trash can, etc.). */
  essentialProductSlugs: string[];
  appearance: RoomAppearance;
  buildPlan: () => FloorPlan;
  furniture: RoomTemplateFurnitureSeed[];
}

function envWithAppearance(appearance: RoomAppearance): RoomEnvironment {
  return {
    ...DEFAULT_ENVIRONMENT,
    appearance: { ...appearance },
  };
}

function bedSize(): [number, number, number] {
  const def = FURNITURE.bed;
  const leg = 8;
  return [def.size[0], leg + def.size[1], def.size[2]];
}

function sizeFor(kind: Exclude<FurnitureKind, 'imported' | 'hanging'>): [number, number, number] {
  if (kind === 'bed') return bedSize();
  return [...FURNITURE[kind].size] as [number, number, number];
}

/** Classic dorm rectangle used by all starter packages. */
function dormPlan(): FloorPlan {
  return rectanglePlan(ROOM.width, ROOM.depth, ROOM.height);
}

export const ROOM_TEMPLATES: readonly RoomTemplate[] = [
  {
    id: 'balanced-dorm',
    label: 'Balanced dorm',
    tagline: 'Sleep · study · store',
    description:
      'A ready layout with bed, desk, dresser, and lamp. Shop the simple supplies, then tweak tables and finishes.',
    essentialProductSlugs: [
      'command-strips',
      'power-strip',
      'hangers',
      'door-hangers-1',
      'laundry-basket-1',
      'towel',
      'charger',
    ],
    appearance: {
      ...DEFAULT_APPEARANCE,
      wallColor: '#d8d0c2',
      floorPreset: 'lightOak',
    },
    buildPlan: dormPlan,
    furniture: [
      { kind: 'bed', position: [24, 0, 48], rotationY: 0, beddingEnabled: true },
      { kind: 'nightstand', position: [48, 0, 28], rotationY: 0 },
      { kind: 'lamp', position: [48, 0, 42], rotationY: 0, label: 'Bedside lamp' },
      { kind: 'desk', position: [72, 0, 140], rotationY: Math.PI / 2 },
      { kind: 'chair', position: [58, 0, 140], rotationY: -Math.PI / 2 },
      { kind: 'dresser', position: [28, 0, 155], rotationY: 0 },
    ],
  },
  {
    id: 'study-first',
    label: 'Study-first',
    tagline: 'Desk against the window',
    description:
      'Desk and chair get the best light. Bed and storage stay compact along the side wall.',
    essentialProductSlugs: [
      'desk-lamp-warm',
      'power-strip',
      'command-strips',
      'charger',
      'clock',
      'cutlery',
    ],
    appearance: {
      ...DEFAULT_APPEARANCE,
      wallColor: '#cfc7b8',
      floorPreset: 'lightOak',
    },
    buildPlan: dormPlan,
    furniture: [
      { kind: 'desk', position: [50, 0, 150], rotationY: 0, label: 'Study desk' },
      { kind: 'chair', position: [50, 0, 132], rotationY: Math.PI },
      { kind: 'lamp', position: [72, 0, 150], rotationY: 0, label: 'Desk lamp' },
      { kind: 'bed', position: [26, 0, 55], rotationY: 0, beddingEnabled: true },
      { kind: 'nightstand', position: [52, 0, 30], rotationY: 0 },
      { kind: 'dresser', position: [78, 0, 40], rotationY: -Math.PI / 2 },
    ],
  },
  {
    id: 'storage-first',
    label: 'Storage-first',
    tagline: 'Closet-ready + bins',
    description:
      'Wardrobe and dresser maximize storage. Complex furniture stays editable; essentials ship as a shopping list.',
    essentialProductSlugs: [
      'storage-1',
      'hangers',
      'door-hangers-2',
      'laundry-basket-2',
      'command-strips',
      'soap',
      'shower-shoes',
    ],
    appearance: {
      ...DEFAULT_APPEARANCE,
      wallColor: '#6b7f6a',
      floorPreset: 'concrete',
    },
    buildPlan: dormPlan,
    furniture: [
      { kind: 'wardrobe', position: [78, 0, 40], rotationY: -Math.PI / 2 },
      { kind: 'dresser', position: [78, 0, 90], rotationY: -Math.PI / 2 },
      { kind: 'bed', position: [28, 0, 50], rotationY: 0, beddingEnabled: true },
      { kind: 'desk', position: [50, 0, 155], rotationY: 0 },
      { kind: 'chair', position: [50, 0, 138], rotationY: Math.PI },
      { kind: 'lamp', position: [28, 0, 100], rotationY: 0 },
    ],
  },
] as const;

export function getRoomTemplate(id: RoomTemplateId): RoomTemplate | undefined {
  return ROOM_TEMPLATES.find((t) => t.id === id);
}

export function buildTemplateEnvironment(template: RoomTemplate): RoomEnvironment {
  return envWithAppearance(template.appearance);
}

/** Materialize template furniture into Zustand Item payloads with fresh ids. */
export function buildTemplateItems(template: RoomTemplate): {
  items: Item[];
  order: string[];
} {
  const items: Item[] = [];
  const order: string[] = [];
  template.furniture.forEach((seed, index) => {
    const id = `item-${index + 1}`;
    const def = FURNITURE[seed.kind];
    const size = sizeFor(seed.kind);
    const item: Item = {
      id,
      kind: seed.kind,
      position: [...seed.position] as [number, number, number],
      rotationY: seed.rotationY ?? 0,
      size,
      bedLegHeight: seed.kind === 'bed' ? 8 : undefined,
      beddingEnabled: seed.kind === 'bed' ? seed.beddingEnabled !== false : undefined,
      label: seed.label ?? def.label,
      attachmentKey: newAttachmentKey(),
    };
    items.push(item);
    order.push(id);
  });
  return { items, order };
}

export function templatePreviewItems(template: RoomTemplate): Item[] {
  return buildTemplateItems(template).items;
}
