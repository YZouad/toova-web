/**
 * Room-area tag taxonomy for floor-plan zones.
 * Tags attach to enclosed areas and drive catalog / checklist suggestions.
 */

import type { CatalogCategorySlug } from './catalogCategories';
import type { FurnitureKind } from '../furniture/registry';
import type { MaterialPresetId } from './roomMaterials';

export const ROOM_TAG_DEFS = [
  {
    id: 'bedroom',
    label: 'Bedroom',
    glyph: 'Bd',
    color: 'rgba(180, 140, 110, 0.28)',
    stroke: 'rgba(140, 100, 70, 0.55)',
    catalogCategories: ['beds', 'storage', 'lighting'] as CatalogCategorySlug[],
    essentials: ['bed', 'nightstand'] as FurnitureKind[],
    shoppingSlugs: ['bedding', 'lamp', 'storage'],
    defaultFloorPreset: 'lightOak' as MaterialPresetId,
  },
  {
    id: 'living_room',
    label: 'Living room',
    glyph: 'Lv',
    color: 'rgba(120, 150, 130, 0.26)',
    stroke: 'rgba(80, 110, 90, 0.55)',
    catalogCategories: ['seating', 'tables', 'rugs', 'lighting', 'decor_art'] as CatalogCategorySlug[],
    essentials: ['chair'] as FurnitureKind[],
    shoppingSlugs: ['seating', 'lamp', 'decor'],
    defaultFloorPreset: 'lightOak' as MaterialPresetId,
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    glyph: 'Kt',
    color: 'rgba(200, 120, 90, 0.26)',
    stroke: 'rgba(160, 80, 50, 0.55)',
    catalogCategories: ['kitchen', 'appliances', 'tables'] as CatalogCategorySlug[],
    essentials: [] as FurnitureKind[],
    shoppingSlugs: ['kitchen', 'appliances'],
    defaultFloorPreset: 'concrete' as MaterialPresetId,
  },
  {
    id: 'dining',
    label: 'Dining',
    glyph: 'Dn',
    color: 'rgba(190, 150, 100, 0.26)',
    stroke: 'rgba(150, 110, 60, 0.55)',
    catalogCategories: ['tables', 'seating', 'lighting'] as CatalogCategorySlug[],
    essentials: ['chair'] as FurnitureKind[],
    shoppingSlugs: ['tables', 'seating'],
    defaultFloorPreset: 'lightOak' as MaterialPresetId,
  },
  {
    id: 'bathroom',
    label: 'Bathroom',
    glyph: 'Ba',
    color: 'rgba(100, 150, 180, 0.26)',
    stroke: 'rgba(60, 110, 140, 0.55)',
    catalogCategories: ['bathroom', 'storage'] as CatalogCategorySlug[],
    essentials: [] as FurnitureKind[],
    shoppingSlugs: ['bathroom', 'shower', 'toiletries'],
    defaultFloorPreset: 'concrete' as MaterialPresetId,
  },
  {
    id: 'office',
    label: 'Office',
    glyph: 'Of',
    color: 'rgba(110, 130, 170, 0.26)',
    stroke: 'rgba(70, 90, 130, 0.55)',
    catalogCategories: ['desks_workspaces', 'seating', 'storage', 'lighting'] as CatalogCategorySlug[],
    essentials: ['desk', 'chair'] as FurnitureKind[],
    shoppingSlugs: ['desk', 'lamp', 'storage'],
    defaultFloorPreset: 'carpet' as MaterialPresetId,
  },
  {
    id: 'closet',
    label: 'Closet',
    glyph: 'Cl',
    color: 'rgba(150, 130, 150, 0.24)',
    stroke: 'rgba(110, 90, 110, 0.5)',
    catalogCategories: ['storage'] as CatalogCategorySlug[],
    essentials: ['wardrobe'] as FurnitureKind[],
    shoppingSlugs: ['storage', 'hangers'],
    defaultFloorPreset: 'lightOak' as MaterialPresetId,
  },
  {
    id: 'laundry',
    label: 'Laundry',
    glyph: 'Ln',
    color: 'rgba(130, 160, 170, 0.24)',
    stroke: 'rgba(90, 120, 130, 0.5)',
    catalogCategories: ['appliances', 'storage'] as CatalogCategorySlug[],
    essentials: [] as FurnitureKind[],
    shoppingSlugs: ['laundry', 'hamper'],
    defaultFloorPreset: 'concrete' as MaterialPresetId,
  },
  {
    id: 'entry',
    label: 'Entry',
    glyph: 'En',
    color: 'rgba(160, 140, 120, 0.24)',
    stroke: 'rgba(120, 100, 80, 0.5)',
    catalogCategories: ['storage', 'decor_art', 'lighting'] as CatalogCategorySlug[],
    essentials: [] as FurnitureKind[],
    shoppingSlugs: ['storage', 'decor'],
    defaultFloorPreset: 'lightOak' as MaterialPresetId,
  },
  {
    id: 'hallway',
    label: 'Hallway',
    glyph: 'Hw',
    color: 'rgba(140, 140, 140, 0.2)',
    stroke: 'rgba(100, 100, 100, 0.45)',
    catalogCategories: ['lighting', 'decor_art'] as CatalogCategorySlug[],
    essentials: [] as FurnitureKind[],
    shoppingSlugs: ['lighting', 'decor'],
    defaultFloorPreset: 'lightOak' as MaterialPresetId,
  },
  {
    id: 'kids',
    label: 'Kids',
    glyph: 'Kd',
    color: 'rgba(200, 160, 120, 0.26)',
    stroke: 'rgba(160, 120, 80, 0.55)',
    catalogCategories: ['kids', 'beds', 'storage', 'seating'] as CatalogCategorySlug[],
    essentials: ['bed'] as FurnitureKind[],
    shoppingSlugs: ['kids', 'bedding', 'storage'],
    defaultFloorPreset: 'carpet' as MaterialPresetId,
  },
  {
    id: 'dorm',
    label: 'Dorm',
    glyph: 'Dm',
    color: 'rgba(130, 120, 170, 0.26)',
    stroke: 'rgba(90, 80, 130, 0.55)',
    catalogCategories: ['beds', 'desks_workspaces', 'storage', 'seating', 'lighting'] as CatalogCategorySlug[],
    essentials: ['bed', 'desk'] as FurnitureKind[],
    shoppingSlugs: ['bedding', 'desk', 'lamp', 'storage', 'shower'],
    defaultFloorPreset: 'lightOak' as MaterialPresetId,
  },
  {
    id: 'other',
    label: 'Other',
    glyph: '·',
    color: 'rgba(150, 145, 135, 0.22)',
    stroke: 'rgba(110, 105, 95, 0.45)',
    catalogCategories: ['other', 'storage', 'lighting'] as CatalogCategorySlug[],
    essentials: [] as FurnitureKind[],
    shoppingSlugs: [],
    defaultFloorPreset: 'lightOak' as MaterialPresetId,
  },
] as const;

export type RoomTag = (typeof ROOM_TAG_DEFS)[number]['id'];

export type RoomTagDef = (typeof ROOM_TAG_DEFS)[number];

export const ROOM_TAGS: RoomTag[] = ROOM_TAG_DEFS.map((d) => d.id);

const DEF_BY_ID = Object.fromEntries(ROOM_TAG_DEFS.map((d) => [d.id, d])) as Record<
  RoomTag,
  RoomTagDef
>;

export function isRoomTag(value: unknown): value is RoomTag {
  return typeof value === 'string' && value in DEF_BY_ID;
}

export function roomTagDef(tag: RoomTag): RoomTagDef {
  return DEF_BY_ID[tag];
}

export function roomTagLabel(tag: RoomTag): string {
  return DEF_BY_ID[tag].label;
}

export function nextRoomTag(current: RoomTag | null | undefined): RoomTag {
  if (!current) return ROOM_TAGS[0]!;
  const idx = ROOM_TAGS.indexOf(current);
  return ROOM_TAGS[(idx + 1) % ROOM_TAGS.length]!;
}
