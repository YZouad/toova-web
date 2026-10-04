import { FURNITURE, isWallShelfKind, type FurnitureKind, type GalleryFurnitureKind } from '../furniture/registry';
import { defaultWallShelfPose } from '../interaction/collision';
import { DEFAULT_BLANKET_COLOR, newAttachmentKey, type Item } from '../store';
import { CHECKLIST_RUG_MODEL_PATH, DEFAULT_RUG_COLOR } from './checklistPublicGlbs';
import type { AgenticReviewRow } from './agenticRoomResolveFromList';
export { defaultPlaceInRoom, rowCanPlaceInRoom } from './agenticRoomPlacement';
import {
  aabbsOverlap,
  doorFootprintAABBs,
  footprintBlocksDoor,
  rotatedFootprintAabb,
  type FootprintAabb,
} from './floorClearance';
import {
  allWallSegments,
  type FloorPlan,
  type WallSegment,
} from './floorPlanGeometry';
import { parseInchDims } from './importedItemSize';
import { shouldStandImportedUpright, standUpFlatBounds } from './importedUpright';
import { supabase } from './supabase';

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

const WALL_INSET = 4;
const PIECE_GAP = 6;
/** Center of wall poster art from floor (inches). */
export const WALL_POSTER_CENTER_Y = 57;
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

function builtinPiece(
  query: string,
  kind: GalleryFurnitureKind,
  label: string,
  curatedProductId?: string,
): AgenticPackPiece {
  const def = FURNITURE[kind];
  return {
    query,
    label,
    kind,
    size: [...def.size] as [number, number, number],
    isLamp: kind === 'lamp',
    curatedProductId,
    beddingEnabled: kind === 'bed' ? true : undefined,
    blanketColor: kind === 'bed' ? DEFAULT_BLANKET_COLOR : undefined,
  };
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

  for (const row of rows) {
    if (!row.placeInRoom) continue;

    const label = row.product?.name ?? row.query;
    const qty = Math.max(1, row.qty);

    const bankPoster = row.bankPoster;
    if (bankPoster?.modelUrl) {
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
        for (let i = 0; i < qty; i++) {
          pieces.push(
            importedPiece({
              query: row.query,
              label: product.name,
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

interface PlacedPiece {
  piece: AgenticPackPiece;
  cx: number;
  cz: number;
  rotationY: number;
  positionY: number;
  aabb: FootprintAabb;
}

function inwardRotationY(seg: WallSegment): number {
  return Math.atan2(-seg.outward[0], -seg.outward[1]);
}

function doorBlockedIntervals(plan: FloorPlan, seg: WallSegment): Array<{ start: number; end: number }> {
  const doors = doorFootprintAABBs(plan);
  const intervals: Array<{ start: number; end: number }> = [];
  const [tx, tz] = seg.tangent;
  const sx = seg.start.x;
  const sz = seg.start.z;

  for (const door of doors) {
    const corners: Array<[number, number]> = [
      [door.minX, door.minZ],
      [door.maxX, door.minZ],
      [door.maxX, door.maxZ],
      [door.minX, door.maxZ],
    ];
    let minT = Infinity;
    let maxT = -Infinity;
    for (const [x, z] of corners) {
      const t = (x - sx) * tx + (z - sz) * tz;
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }
    if (maxT > 0 && minT < seg.length) {
      intervals.push({
        start: Math.max(0, minT - PIECE_GAP),
        end: Math.min(seg.length, maxT + PIECE_GAP),
      });
    }
  }
  return intervals;
}

function intervalOverlaps(
  start: number,
  end: number,
  blocked: Array<{ start: number; end: number }>,
): boolean {
  return blocked.some((b) => start < b.end && end > b.start);
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
      tintColor: isRug ? DEFAULT_RUG_COLOR : undefined,
      wallMounted: piece.wallPoster ? true : undefined,
      attachmentKey: newAttachmentKey(),
    };
  }

  const def = FURNITURE[piece.kind as GalleryFurnitureKind];
  const isBed = piece.kind === 'bed';
  const bedLegHeight = isBed ? 8 : undefined;
  const bodyH = isBed ? def.size[1] : 0;
  const size: [number, number, number] = isBed
    ? [def.size[0], (bedLegHeight ?? 8) + bodyH, def.size[2]]
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

function findLampHost(
  hosts: PlacedPiece[],
  usedHostKeys: Set<string>,
): PlacedPiece | null {
  const priority: GalleryFurnitureKind[] = ['desk', 'nightstand', 'dresser'];
  for (const kind of priority) {
    const host = hosts.find(
      (h) => h.piece.kind === kind && !usedHostKeys.has(`${h.cx},${h.cz}`),
    );
    if (host) return host;
  }
  return null;
}

/** Place CC0 bank posters on walls at eye level; avoids door spans. */
export function packAgenticWallPosters(
  plan: FloorPlan,
  posterPieces: AgenticPackPiece[],
  placedFloor: PlacedPiece[] = [],
): { placed: PlacedPiece[]; skipped: string[] } {
  const skipped: string[] = [];
  const placed: PlacedPiece[] = [];
  const walls = allWallSegments(plan).sort((a, b) => b.length - a.length);
  const wallCursors = new Map<string, number>();

  for (const piece of posterPieces) {
    const widthAlong = piece.size[0];
    const depthIn = piece.size[2];
    const bottomY = Math.max(0, WALL_POSTER_CENTER_Y - piece.size[1] / 2);
    let packed = false;

    for (const seg of walls) {
      const rotationY = inwardRotationY(seg);
      const blocked = doorBlockedIntervals(plan, seg);
      let cursor = wallCursors.get(seg.wall.id) ?? PIECE_GAP + widthAlong / 2;
      const [tx, tz] = seg.tangent;
      const interiorX = -seg.outward[0];
      const interiorZ = -seg.outward[1];
      const inset = depthIn / 2 + WALL_INSET;

      while (cursor + widthAlong / 2 + PIECE_GAP <= seg.length) {
        const tStart = cursor - widthAlong / 2;
        const tEnd = cursor + widthAlong / 2;
        if (intervalOverlaps(tStart, tEnd, blocked)) {
          const nextBlock = blocked.find((b) => tStart < b.end && tEnd > b.start);
          cursor = (nextBlock?.end ?? tEnd) + PIECE_GAP + widthAlong / 2;
          continue;
        }

        const cx = seg.start.x + tx * cursor + interiorX * inset;
        const cz = seg.start.z + tz * cursor + interiorZ * inset;
        const aabb = rotatedFootprintAabb(cx, cz, piece.size[0], piece.size[2], rotationY);

        const overlapsFloor = placedFloor.some((p) => aabbsOverlap(aabb, p.aabb));
        const overlapsPoster = placed.some((p) => aabbsOverlap(aabb, p.aabb));
        if (overlapsFloor || overlapsPoster) {
          cursor += widthAlong + PIECE_GAP;
          continue;
        }

        placed.push({
          piece,
          cx,
          cz,
          rotationY,
          positionY: bottomY,
          aabb,
        });
        wallCursors.set(seg.wall.id, tEnd + PIECE_GAP + widthAlong / 2);
        packed = true;
        break;
      }
      if (packed) break;
    }

    if (!packed) skipped.push(piece.query);
  }

  return { placed, skipped };
}

/** Greedy wall packing for floor furniture; lamps snap onto desk / nightstand / dresser tops. */
export function packAgenticFloorItems(plan: FloorPlan, pieces: AgenticPackPiece[]): AgenticPackResult {
  const skipped: string[] = [];
  const doors = doorFootprintAABBs(plan);

  const posterPieces = pieces.filter((p) => p.wallPoster);
  const floorPieces = pieces.filter((p) => !p.isLamp && !isWallShelfKind(p.kind) && !p.wallPoster);
  const shelfPieces = pieces.filter((p) => isWallShelfKind(p.kind));
  const lampPieces = pieces.filter((p) => p.isLamp);

  floorPieces.sort(
    (a, b) => b.size[0] * b.size[2] - a.size[0] * a.size[2],
  );

  const walls = allWallSegments(plan).sort((a, b) => b.length - a.length);
  const wallCursors = new Map<string, number>();
  const placed: PlacedPiece[] = [];

  for (const piece of floorPieces) {
    const widthAlong = piece.size[0];
    const depthIn = piece.size[2];
    let packed = false;

    for (const seg of walls) {
      const rotationY = inwardRotationY(seg);
      const blocked = doorBlockedIntervals(plan, seg);
      let cursor = wallCursors.get(seg.wall.id) ?? PIECE_GAP + widthAlong / 2;
      const [tx, tz] = seg.tangent;
      const interiorX = -seg.outward[0];
      const interiorZ = -seg.outward[1];
      const inset = depthIn / 2 + WALL_INSET;

      while (cursor + widthAlong / 2 + PIECE_GAP <= seg.length) {
        const tStart = cursor - widthAlong / 2;
        const tEnd = cursor + widthAlong / 2;
        if (intervalOverlaps(tStart, tEnd, blocked)) {
          const nextBlock = blocked.find((b) => tStart < b.end && tEnd > b.start);
          cursor = (nextBlock?.end ?? tEnd) + PIECE_GAP + widthAlong / 2;
          continue;
        }

        const cx = seg.start.x + tx * cursor + interiorX * inset;
        const cz = seg.start.z + tz * cursor + interiorZ * inset;
        const aabb = rotatedFootprintAabb(cx, cz, piece.size[0], piece.size[2], rotationY);

        if (footprintBlocksDoor(plan, cx, cz, piece.size[0], piece.size[2], rotationY, doors)) {
          cursor += widthAlong + PIECE_GAP;
          continue;
        }

        const overlaps = placed.some((p) => aabbsOverlap(aabb, p.aabb));
        if (overlaps) {
          cursor += widthAlong + PIECE_GAP;
          continue;
        }

        placed.push({
          piece,
          cx,
          cz,
          rotationY,
          positionY: 0,
          aabb,
        });
        wallCursors.set(seg.wall.id, tEnd + PIECE_GAP + widthAlong / 2);
        packed = true;
        break;
      }
      if (packed) break;
    }

    if (!packed) skipped.push(piece.query);
  }

  const { placed: wallPosters, skipped: posterSkipped } = packAgenticWallPosters(
    plan,
    posterPieces,
    placed,
  );
  skipped.push(...posterSkipped);
  placed.push(...wallPosters);

  for (const piece of shelfPieces) {
    const pose = defaultWallShelfPose(plan, piece.size);
    const aabb = rotatedFootprintAabb(
      pose.position[0],
      pose.position[2],
      piece.size[0],
      piece.size[2],
      pose.rotationY,
    );
    placed.push({
      piece,
      cx: pose.position[0],
      cz: pose.position[2],
      rotationY: pose.rotationY,
      positionY: pose.position[1],
      aabb,
    });
  }

  const usedLampHosts = new Set<string>();
  const floorHosts = placed.filter((p) => !p.piece.isLamp && !isWallShelfKind(p.piece.kind));

  for (const piece of lampPieces) {
    const host = findLampHost(floorHosts, usedLampHosts);
    if (!host) {
      skipped.push(`${piece.query} (no desk or nightstand to place lamp on)`);
      continue;
    }
    usedLampHosts.add(`${host.cx},${host.cz}`);
    const hostTopY =
      host.piece.kind === 'imported'
        ? host.piece.size[1]
        : FURNITURE[host.piece.kind as GalleryFurnitureKind].size[1];
    const lampY = hostTopY;
    const cx = host.cx;
    const cz = host.cz;
    const rotationY = host.rotationY;
    const aabb = rotatedFootprintAabb(cx, cz, piece.size[0], piece.size[2], rotationY);
    placed.push({
      piece,
      cx,
      cz,
      rotationY,
      positionY: lampY,
      aabb,
    });
  }

  const items: Item[] = [];
  const order: string[] = [];
  let nextId = 1;

  for (const p of placed) {
    const id = `item-${nextId++}`;
    items.push(
      pieceToItem(
        p.piece,
        id,
        [p.cx, p.positionY, p.cz],
        p.rotationY,
      ),
    );
    order.push(id);
  }

  return { items, order, skipped };
}
