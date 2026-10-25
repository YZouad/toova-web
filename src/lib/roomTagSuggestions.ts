/**
 * Pure helpers: given a plan + placed items, suggest catalog categories and
 * missing essentials for each tagged area.
 */

import type { FurnitureKind } from '../furniture/registry';
import type { Item } from '../store';
import type { CatalogCategorySlug } from './catalogCategories';
import {
  type FloorPlan,
  type ResolvedArea,
  resolveZones,
  zoneAtPoint,
} from './floorPlanGeometry';
import { roomTagDef, roomTagLabel, type RoomTag } from './roomTags';

export interface AreaSuggestion {
  faceKey: string;
  tag: RoomTag;
  label: string;
  name?: string;
  areaSqIn: number;
  labelAnchor: [number, number];
  catalogCategories: CatalogCategorySlug[];
  shoppingSlugs: string[];
  itemIds: string[];
  presentEssentials: FurnitureKind[];
  missingEssentials: FurnitureKind[];
}

export interface RoomTagSuggestionReport {
  areas: AreaSuggestion[];
  /** First tagged area, or null when nothing is tagged. */
  primary: AreaSuggestion | null;
}

function itemPlanPoint(item: Item): [number, number] {
  return [item.position[0], item.position[2]];
}

function essentialsFor(tag: RoomTag): FurnitureKind[] {
  return [...roomTagDef(tag).essentials];
}

/** Group placed items into tagged areas and compute missing essentials. */
export function buildRoomTagSuggestions(
  plan: FloorPlan,
  items: Item[],
): RoomTagSuggestionReport {
  const resolved = resolveZones(plan);
  const tagged = resolved.filter((a): a is ResolvedArea & { zone: NonNullable<ResolvedArea['zone']> } =>
    a.zone != null,
  );

  const areas: AreaSuggestion[] = tagged.map((area) => {
    const def = roomTagDef(area.zone.tag);
    const itemIds: string[] = [];
    const present = new Set<FurnitureKind>();
    for (const item of items) {
      if (item.kind === 'hanging' || item.kind === 'light') continue;
      const [x, z] = itemPlanPoint(item);
      if (!pointInResolvedFace(x, z, area)) continue;
      itemIds.push(item.id);
      present.add(item.kind);
    }
    const essentials = essentialsFor(area.zone.tag);
    const presentEssentials = essentials.filter((k) => present.has(k));
    const missingEssentials = essentials.filter((k) => !present.has(k));
    return {
      faceKey: area.faceKey,
      tag: area.zone.tag,
      label: area.zone.name?.trim() || roomTagLabel(area.zone.tag),
      name: area.zone.name,
      areaSqIn: area.areaSqIn,
      labelAnchor: area.labelAnchor,
      catalogCategories: [...def.catalogCategories],
      shoppingSlugs: [...def.shoppingSlugs],
      itemIds,
      presentEssentials,
      missingEssentials,
    };
  });

  return { areas, primary: areas[0] ?? null };
}

function pointInResolvedFace(x: number, z: number, area: ResolvedArea): boolean {
  const face = area.face;
  if (face.length < 3) return false;
  let inside = false;
  for (let i = 0, j = face.length - 1; i < face.length; j = i++) {
    const xi = face[i]!.x;
    const zi = face[i]!.z;
    const xj = face[j]!.x;
    const zj = face[j]!.z;
    const intersect =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Suggestion for the area containing a world point, or the primary tagged area. */
export function suggestionForPoint(
  report: RoomTagSuggestionReport,
  plan: FloorPlan,
  x: number,
  z: number,
): AreaSuggestion | null {
  const hit = zoneAtPoint(plan, x, z);
  if (hit?.zone) {
    return report.areas.find((a) => a.faceKey === hit.faceKey) ?? null;
  }
  return report.primary;
}

/** Suggestion for the area containing the selected item, else primary. */
export function suggestionForSelection(
  report: RoomTagSuggestionReport,
  plan: FloorPlan,
  selected: Item | null,
): AreaSuggestion | null {
  if (selected) {
    const [x, z] = itemPlanPoint(selected);
    const hit = suggestionForPoint(report, plan, x, z);
    if (hit) return hit;
  }
  return report.primary;
}

export function essentialLabel(kind: FurnitureKind): string {
  switch (kind) {
    case 'bed':
      return 'Bed';
    case 'nightstand':
      return 'Nightstand';
    case 'desk':
      return 'Desk';
    case 'chair':
      return 'Chair';
    case 'wardrobe':
      return 'Wardrobe';
    case 'dresser':
      return 'Dresser';
    case 'bookshelf':
      return 'Bookshelf';
    case 'shelf':
      return 'Shelf';
    case 'lamp':
      return 'Lamp';
    default:
      return kind;
  }
}
