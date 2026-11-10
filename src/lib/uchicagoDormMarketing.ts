/**
 * Marketing previews: example furniture on measured UChicago starters (not saved layouts).
 */

import { FURNITURE } from '../furniture/registry';
import { planBounds, type FloorPlan } from './floorPlanGeometry';
import type { UChicagoLayoutType } from './uchicagoDormTemplates';
import type { StarterFloorSeed } from './roomStarterTemplates';
import type { RoomPreviewItem } from '../ui/RoomPreview';
import { DEFAULT_BLANKET_COLOR, newAttachmentKey, type Item } from '../store';

const FACE_IN_FROM_SOUTH = 0;
const FACE_IN_FROM_NORTH = Math.PI;
const FACE_IN_FROM_EAST = -Math.PI / 2;
const FACE_IN_FROM_WEST = Math.PI / 2;

function previewPiece(
  id: string,
  kind: string,
  x: number,
  z: number,
  rotationY: number,
): RoomPreviewItem {
  const def = FURNITURE[kind as keyof typeof FURNITURE];
  if (!def) {
    return { id, kind, position: [x, 0, z], rotationY, size: [24, 24, 24] };
  }
  const isBed = kind === 'bed';
  const size: [number, number, number] = isBed
    ? [def.size[0], 8 + def.size[1], def.size[2]]
    : ([...def.size] as [number, number, number]);
  return { id, kind, position: [x, 0, z], rotationY, size };
}

/** Example floor seeds for UChicago starters (matches preview layout). */
export function uchicagoDemoFloorSeeds(
  layout: UChicagoLayoutType,
  plan: FloorPlan,
): StarterFloorSeed[] {
  return uchicagoDemoPreviewItems(layout, plan).map((piece) => ({
    kind: piece.kind as StarterFloorSeed['kind'],
    position: [...piece.position] as [number, number, number],
    rotationY: piece.rotationY,
  }));
}

/** Typical dorm furnishing for SEO / landing previews. */
export function uchicagoDemoPreviewItems(
  layout: UChicagoLayoutType,
  plan: FloorPlan,
): RoomPreviewItem[] {
  const b = planBounds(plan);
  const pad = 28;
  const southZ = b.maxZ - pad;
  const northZ = b.minZ + pad;
  const westX = b.minX + pad;
  const eastX = b.maxX - pad;
  const midX = (b.minX + b.maxX) / 2;

  if (layout === 'double' || layout === 'pass-through') {
    return [
      previewPiece('demo-bed-a', 'bed', westX, southZ, FACE_IN_FROM_SOUTH),
      previewPiece('demo-bed-b', 'bed', eastX, southZ, FACE_IN_FROM_SOUTH),
      previewPiece('demo-desk-a', 'desk', westX, northZ, FACE_IN_FROM_NORTH),
      previewPiece('demo-desk-b', 'desk', eastX, northZ, FACE_IN_FROM_NORTH),
      previewPiece('demo-chair-a', 'chair', westX, northZ + 26, FACE_IN_FROM_SOUTH),
      previewPiece('demo-chair-b', 'chair', eastX, northZ + 26, FACE_IN_FROM_SOUTH),
      previewPiece('demo-dresser', 'dresser', midX, (b.minZ + b.maxZ) / 2, FACE_IN_FROM_WEST),
    ];
  }

  return [
    previewPiece('demo-bed', 'bed', midX, southZ, FACE_IN_FROM_SOUTH),
    previewPiece('demo-desk', 'desk', westX, northZ, FACE_IN_FROM_NORTH),
    previewPiece('demo-chair', 'chair', westX, northZ + 26, FACE_IN_FROM_SOUTH),
    previewPiece('demo-dresser', 'dresser', eastX, (b.minZ + b.maxZ) / 2, FACE_IN_FROM_EAST),
    previewPiece('demo-lamp', 'lamp', westX + 24, northZ, FACE_IN_FROM_NORTH),
  ];
}

function previewToStoreItem(preview: RoomPreviewItem): Item {
  const def = FURNITURE[preview.kind as keyof typeof FURNITURE];
  const isBed = preview.kind === 'bed';
  const bedLegHeight = isBed ? 8 : undefined;
  const size: [number, number, number] = isBed
    ? [
        def?.size[0] ?? preview.size[0],
        (bedLegHeight ?? 8) + (def?.size[1] ?? preview.size[1]),
        def?.size[2] ?? preview.size[2],
      ]
    : preview.size;

  return {
    id: preview.id,
    kind: preview.kind as Item['kind'],
    position: [...preview.position] as [number, number, number],
    rotationY: preview.rotationY,
    size,
    bedLegHeight,
    label: def?.label,
    beddingEnabled: isBed ? true : undefined,
    blanketColor: isBed ? DEFAULT_BLANKET_COLOR : undefined,
    attachmentKey: newAttachmentKey(),
  };
}

/** 3D designer store items for marketing dorm renders (matches preview layout). */
export function uchicagoDemoMaterializedItems(
  layout: UChicagoLayoutType,
  plan: FloorPlan,
): { items: Item[]; order: string[] } {
  const items = uchicagoDemoPreviewItems(layout, plan).map(previewToStoreItem);
  return { items, order: items.map((it) => it.id) };
}
