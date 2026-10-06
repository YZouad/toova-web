import { FURNITURE, isWallShelfKind, type FurnitureKind, type GalleryFurnitureKind } from '../furniture/registry';
import { DEFAULT_BLANKET_COLOR, newAttachmentKey, type Item } from '../store';
import { CHECKLIST_RUG_MODEL_PATH, DEFAULT_RUG_COLOR } from './checklistPublicGlbs';
import type { AgenticReviewRow } from './agenticRoomResolveFromList';
export { defaultPlaceInRoom, rowCanPlaceInRoom } from './agenticRoomPlacement';
import { type FloorPlan } from './floorPlanGeometry';
import { arrangeRoomItems, type LayoutVariant } from './roomLayoutArrange';
export { WALL_POSTER_CENTER_Y } from './roomLayoutArrange';
import { bedFrameSpecificity, isBedFrameQuery, resolveBedFootprint } from './agenticBedSize';
import { parseInchDims } from './importedItemSize';
import { shouldStandImportedUpright, standUpFlatBounds } from './importedUpright';
import { resolvePlaceHangingKind } from './dormChecklist';
import {
  appendHangingFromSeeds,
  pickAgenticHangingSeeds,
} from './hangingDecorPlacement';
import type { HangingDecorKind } from './hangingDecorGeometry';
import { supabase } from './supabase';

const CHECKLIST_RUG_KIND = 'checklist-rug';

export type AgenticPackRow = AgenticReviewRow;

export interface AgenticPackPiece {
  query: string;
  label: string;
  kind: FurnitureKind;
  size: [number, number, number];
  isLamp: boolean;
  curatedProductId?: string;
  importedStoragePath?: string;
  catalogKind?: string;
  catalogSizeIn?: [number, number, number];
  beddingEnabled?: boolean;
  blanketColor?: string;
  /** Wall-mounted poster from the built-in CC0 bank. */
  wallPoster?: boolean;
}

export interface AgenticPackResult {
  items: Item[];
  order: string[];
  skipped: string[];
}

async function catalogRowForKind(catalogKind: string): Promise<{
  model_url: string;
  label: string;
  width_in: number;
  height_in: number;
  depth_in: number;
} | null> {
  const { data, error } = await supabase
    .from('furniture_catalog')
    .select('kind,label,model_url,width_in,height_in,depth_in')
    .eq('kind', catalogKind)
    .maybeSingle();
  if (error || !data?.model_url) return null;
  return {
    model_url: String(data.model_url).trim(),
    label: String(data.label ?? catalogKind),
    width_in: Number(data.width_in),
    height_in: Number(data.height_in),
    depth_in: Number(data.depth_in),
  };
}

function bedPieceSize(query: string): [number, number, number] {
  const def = FURNITURE.bed;
  const { widthIn, lengthIn } = resolveBedFootprint(query);
  return [widthIn, def.size[1], lengthIn];
}

function builtinPiece(
  query: string,
  kind: GalleryFurnitureKind,
  label: string,
  curatedProductId?: string,
  sizeOverride?: [number, number, number],
): AgenticPackPiece {
  const def = FURNITURE[kind];
  const size =
    sizeOverride ??
    (kind === 'bed' ? bedPieceSize(query) : ([...def.size] as [number, number, number]));
  return {
    query,
    label,
    kind,
    size,
    isLamp: kind === 'lamp',
    curatedProductId,
    beddingEnabled: kind === 'bed' ? true : undefined,
    blanketColor: kind === 'bed' ? DEFAULT_BLANKET_COLOR : undefined,
  };
}

/** Keep one physical bed; bedding rows stay separate checklist lines. */
export function collapseBedPackRows(rows: AgenticPackRow[]): AgenticPackRow[] {
  let bestBed: AgenticPackRow | null = null;
  const rest: AgenticPackRow[] = [];

  for (const row of rows) {
    const isBed =
      row.builtinKind === 'bed' ||
      row.product?.placeBuiltinKind === 'bed' ||
      isBedFrameQuery(row.query);
    if (!isBed) {
      rest.push(row);
      continue;
    }
    if (!bestBed || bedFrameSpecificity(row.query) > bedFrameSpecificity(bestBed.query)) {
      bestBed = row;
    }
  }

  return bestBed ? [...rest, bestBed] : rest;
}

function importedPiece(input: {
  query: string;
  label: string;
  storagePath: string;
  catalogKind?: string;
  size: [number, number, number];
  curatedProductId?: string;
  wallPoster?: boolean;
}): AgenticPackPiece {
  let size = input.size;
  if (shouldStandImportedUpright(input.label)) {
    size = standUpFlatBounds(size);
  }
  return {
    query: input.query,
    label: input.label,
    kind: 'imported',
    size,
    isLamp: /\blamp\b/i.test(input.label),
    curatedProductId: input.curatedProductId,
    importedStoragePath: input.storagePath,
    catalogKind: input.catalogKind,
    catalogSizeIn: [...size] as [number, number, number],
    wallPoster: input.wallPoster,
  };
}

/** Expand checked rows into placeable pieces (async catalog lookups). */
export async function buildAgenticPackPieces(rows: AgenticPackRow[]): Promise<AgenticPackPiece[]> {
  const pieces: AgenticPackPiece[] = [];
  const collapsed = collapseBedPackRows(rows);
  const seenPosterKinds = new Set<string>();

  for (const row of collapsed) {
    if (!row.placeInRoom) continue;

    const label = row.product?.name ?? row.query;
    const qty = Math.max(1, row.qty);

    const bankPoster = row.bankPoster;
    if (bankPoster?.modelUrl) {
      if (seenPosterKinds.has(bankPoster.kind)) continue;
      seenPosterKinds.add(bankPoster.kind);
      const size: [number, number, number] = [
        bankPoster.widthIn,
        bankPoster.heightIn,
        bankPoster.depthIn,
      ];
      for (let i = 0; i < qty; i++) {
        pieces.push(
          importedPiece({
            query: row.query,
            label: bankPoster.label || label,
            storagePath: bankPoster.modelUrl,
            catalogKind: bankPoster.kind,
            size,
            curatedProductId: row.product?.id,
            wallPoster: true,
          }),
        );
      }
      continue;
    }

    const communityModelUrl = row.communityModel?.modelUrl?.trim();
    if (communityModelUrl) {
      const m = row.communityModel!;
      const size = parseInchDims(m.widthIn, m.heightIn, m.depthIn) ?? [24, 24, 24];
      for (let i = 0; i < qty; i++) {
        pieces.push(
          importedPiece({
            query: row.query,
            label: m.label || label,
            storagePath: communityModelUrl,
            catalogKind: m.kind,
            size,
            curatedProductId: row.product?.id,
          }),
        );
      }
      continue;
    }

    const product = row.product;
    if (product?.placeBuiltinKind && product.placeBuiltinKind in FURNITURE) {
      const kind = product.placeBuiltinKind as GalleryFurnitureKind;
      for (let i = 0; i < qty; i++) {
        pieces.push(builtinPiece(row.query, kind, product.name, product.id));
      }
      continue;
    }

    if (product?.placeCatalogKind) {
      const cat = await catalogRowForKind(product.placeCatalogKind);
      if (cat) {
        const size =
          parseInchDims(cat.width_in, cat.height_in, cat.depth_in) ?? ([24, 24, 24] as [number, number, number]);
        const displayLabel =
          product.placeCatalogKind === CHECKLIST_RUG_KIND ? row.query : product.name;
        for (let i = 0; i < qty; i++) {
          pieces.push(
            importedPiece({
              query: row.query,
              label: displayLabel,
              storagePath: cat.model_url,
              catalogKind: product.placeCatalogKind,
              size,
              curatedProductId: product.id,
            }),
          );
        }
      }
      continue;
    }

    if (row.builtinKind) {
      for (let i = 0; i < qty; i++) {
        pieces.push(builtinPiece(row.query, row.builtinKind, label, product?.id));
      }
    }
  }

  return pieces;
}

function pieceToItem(piece: AgenticPackPiece, id: string, position: [number, number, number], rotationY: number): Item {
  if (piece.kind === 'imported') {
    const isRug =
      piece.importedStoragePath === CHECKLIST_RUG_MODEL_PATH ||
      piece.importedStoragePath?.endsWith('/rug.glb') ||
      piece.label.trim().toLowerCase() === 'rug';
    return {
      id,
      kind: 'imported',
      position,
      rotationY,
      size: piece.size,
      catalogSizeIn: piece.catalogSizeIn,
      catalogKind: piece.catalogKind,
      label: piece.label,
      curatedProductId: piece.curatedProductId,
      importedStoragePath: piece.importedStoragePath,
      catalogTags: piece.wallPoster ? ['poster'] : undefined,
      tintColor: isRug ? DEFAULT_RUG_COLOR : undefined,
      wallMounted: piece.wallPoster ? true : undefined,
      attachmentKey: newAttachmentKey(),
    };
  }

  const def = FURNITURE[piece.kind as GalleryFurnitureKind];
  const isBed = piece.kind === 'bed';
  const bedLegHeight = isBed ? 8 : undefined;
  const bodyH = isBed ? piece.size[1] : 0;
  const size: [number, number, number] = isBed
    ? [piece.size[0], (bedLegHeight ?? 8) + bodyH, piece.size[2]]
    : ([...piece.size] as [number, number, number]);

  return {
    id,
    kind: piece.kind,
    position,
    rotationY,
    size,
    bedLegHeight,
    label: piece.label || def.label,
    beddingEnabled: isBed ? (piece.beddingEnabled ?? true) : undefined,
    blanketColor: isBed ? (piece.blanketColor ?? DEFAULT_BLANKET_COLOR) : undefined,
    curatedProductId: piece.curatedProductId,
    wallMounted: isWallShelfKind(piece.kind) ? true : undefined,
    attachmentKey: newAttachmentKey(),
  };
}

/** Role-aware floor packing; lamps snap onto hosts, posters prefer the bed wall. */
export function packAgenticFloorItems(
  plan: FloorPlan,
  pieces: AgenticPackPiece[],
  variant: LayoutVariant = 0,
): AgenticPackResult {
  const idToQuery = new Map<string, string>();
  let nextId = 1;
  const provisional: Item[] = pieces.map((piece) => {
    const id = `item-${nextId++}`;
    idToQuery.set(id, piece.query);
    return pieceToItem(piece, id, [0, 0, 0], 0);
  });

  const { items, skippedIds } = arrangeRoomItems(plan, provisional, variant);
  return {
    items,
    order: items.map((it) => it.id),
    skipped: skippedIds.map((id) => idToQuery.get(id) ?? id),
  };
}

function hangingKindsFromRows(rows: AgenticPackRow[]): Array<{
  kind: HangingDecorKind;
  curatedProductId?: string;
}> {
  const out: Array<{ kind: HangingDecorKind; curatedProductId?: string }> = [];
  const seen = new Set<HangingDecorKind>();
  for (const row of rows) {
    if (!row.placeInRoom || !row.product) continue;
    const kind = resolvePlaceHangingKind(row.product);
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    out.push({ kind, curatedProductId: row.product.id });
  }
  return out;
}

/** Pack floor furniture, then auto-span hanging leaves / string lights on walls. */
export function packAgenticRoomItems(
  plan: FloorPlan,
  pieces: AgenticPackPiece[],
  hangingRows: AgenticPackRow[],
  variant: LayoutVariant = 0,
): AgenticPackResult {
  const floor = packAgenticFloorItems(plan, pieces, variant);
  const hangingEntries = hangingKindsFromRows(hangingRows);
  if (hangingEntries.length === 0) return floor;

  const seeds = pickAgenticHangingSeeds(plan, hangingEntries);
  if (seeds.length === 0) return floor;

  const items = [...floor.items];
  const nextIndex = {
    n: items.reduce((max, it) => {
      const n = Number.parseInt(it.id.replace(/^item-/, ''), 10);
      return Number.isFinite(n) ? Math.max(max, n + 1) : max;
    }, 1),
  };
  const addedIds = appendHangingFromSeeds(items, plan, seeds, nextIndex);
  return {
    items,
    order: [...floor.order, ...addedIds],
    skipped: floor.skipped,
  };
}
