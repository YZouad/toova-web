import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import type { AgenticItemAsk } from './agenticRoomPrompt';
import { parseVibeToken } from './agenticRoomVibe';
import { ROOM } from '../units';

/** Origin: front-left floor corner; +X = width, +Z = depth (matches `rectanglePlan`). */
export interface RoomScanPositionIn {
  x: number;
  z: number;
}

export interface RoomScanBBox {
  /** 0–1 normalized, axis-aligned in frame space. */
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface RoomScanManifestItem {
  scanId: string;
  query: string;
  qty: number;
  sizeIn?: [number, number, number];
  /** Footprint center on the floor plane (inches). */
  positionIn?: RoomScanPositionIn;
  rotationY?: number;
  wall?: string;
  locationLabel?: string;
  frameIndex?: number;
  bbox?: RoomScanBBox;
}

export interface RoomScanManifest {
  widthIn: number;
  depthIn: number;
  heightIn?: number;
  roomType?: string;
  theme?: string;
  vibe?: string | null;
  confidence?: number;
  items: RoomScanManifestItem[];
  warnings: string[];
}

export interface RoomScanItemSidecar {
  scanId: string;
  sizeIn?: [number, number, number];
  positionIn?: RoomScanPositionIn;
  rotationY?: number;
  locationLabel?: string;
  frameIndex?: number;
  bbox?: RoomScanBBox;
}

export const ROOM_SCAN_ESTIMATE_WARNING =
  'Room size and furniture positions are vision estimates from your video, not measured dimensions.';

export const ROOM_SCAN_SINGLE_PHOTO_WARNING =
  'This layout is from a single photo; check room size and placement before creating.';

const MIN_ROOM_IN = 48;
const MAX_ROOM_IN = 480;

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function parseSizeIn(raw: unknown): [number, number, number] | undefined {
  if (!Array.isArray(raw) || raw.length < 3) return undefined;
  const w = num(raw[0]);
  const h = num(raw[1]);
  const d = num(raw[2]);
  if (w == null || h == null || d == null) return undefined;
  if (w <= 0 || h <= 0 || d <= 0) return undefined;
  return [w, h, d];
}

function parseBBox(raw: unknown): RoomScanBBox | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const xmin = num(o.xmin ?? o.xMin);
  const ymin = num(o.ymin ?? o.yMin);
  const xmax = num(o.xmax ?? o.xMax);
  const ymax = num(o.ymax ?? o.yMax);
  if (xmin == null || ymin == null || xmax == null || ymax == null) return undefined;
  const a = clamp01(Math.min(xmin, xmax));
  const b = clamp01(Math.min(ymin, ymax));
  const c = clamp01(Math.max(xmin, xmax));
  const d = clamp01(Math.max(ymin, ymax));
  if (c - a < 0.02 || d - b < 0.02) return undefined;
  return { xmin: a, ymin: b, xmax: c, ymax: d };
}

function parsePosition(raw: unknown): RoomScanPositionIn | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const x = num(o.x);
  const z = num(o.z);
  if (x == null || z == null) return undefined;
  return { x, z };
}

function parseItem(raw: unknown, index: number): RoomScanManifestItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const query = String(o.query ?? '').trim();
  if (!query) return null;
  const scanId = String(o.scanId ?? o.id ?? `scan-${index + 1}`).trim() || `scan-${index + 1}`;
  let qty = Math.max(1, Math.floor(num(o.qty) ?? 1));
  if (qty > 1) qty = 1;
  return {
    scanId,
    query,
    qty,
    sizeIn: parseSizeIn(o.sizeIn ?? o.size),
    positionIn: parsePosition(o.positionIn ?? o.position),
    rotationY: num(o.rotationY),
    wall: typeof o.wall === 'string' ? o.wall.trim() : undefined,
    locationLabel: typeof o.locationLabel === 'string' ? o.locationLabel.trim() : undefined,
    frameIndex:
      o.frameIndex != null ? Math.max(0, Math.floor(num(o.frameIndex) ?? 0)) : undefined,
    bbox: parseBBox(o.bbox),
  };
}

/** Parse and validate vision-model JSON into a manifest. */
export function parseRoomScanManifest(raw: unknown): RoomScanManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const widthIn = num(o.widthIn);
  const depthIn = num(o.depthIn);
  if (widthIn == null || depthIn == null) return null;
  const W = Math.min(MAX_ROOM_IN, Math.max(MIN_ROOM_IN, widthIn));
  const D = Math.min(MAX_ROOM_IN, Math.max(MIN_ROOM_IN, depthIn));
  const heightRaw = num(o.heightIn);
  const heightIn =
    heightRaw != null ? Math.min(144, Math.max(84, heightRaw)) : undefined;
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const items: RoomScanManifestItem[] = [];
  itemsRaw.forEach((entry, i) => {
    const parsed = parseItem(entry, i);
    if (parsed) items.push(parsed);
  });
  if (items.length === 0) return null;

  const warnings: string[] = [ROOM_SCAN_ESTIMATE_WARNING];
  if (Array.isArray(o.warnings)) {
    for (const w of o.warnings) {
      const s = String(w).trim();
      if (s && !warnings.includes(s)) warnings.push(s);
    }
  }
  if (widthIn !== W || depthIn !== D) {
    warnings.push('Room dimensions were clamped to a plausible range.');
  }

  return {
    widthIn: W,
    depthIn: D,
    heightIn,
    roomType: typeof o.roomType === 'string' ? o.roomType.trim() : undefined,
    theme: typeof o.theme === 'string' ? o.theme.trim() : undefined,
    vibe: typeof o.vibe === 'string' ? o.vibe : null,
    confidence: num(o.confidence),
    items,
    warnings,
  };
}

export function buildScanSidecarMap(
  manifest: RoomScanManifest,
): Record<string, RoomScanItemSidecar> {
  const map: Record<string, RoomScanItemSidecar> = {};
  for (const item of manifest.items) {
    map[item.scanId] = {
      scanId: item.scanId,
      sizeIn: item.sizeIn,
      positionIn: item.positionIn,
      rotationY: item.rotationY,
      locationLabel: item.locationLabel,
      frameIndex: item.frameIndex,
      bbox: item.bbox,
    };
  }
  return map;
}

export function manifestToFurnitureList(
  manifest: RoomScanManifest,
): { list: AgenticFurnitureListResult; sidecar: Record<string, RoomScanItemSidecar> } {
  const vibeParsed = manifest.vibe ? parseVibeToken(manifest.vibe) : undefined;
  const vibe = vibeParsed ?? undefined;
  const items: AgenticItemAsk[] = manifest.items.map((item) => ({
    query: item.query,
    qty: 1,
    scanId: item.scanId,
  }));
  const list: AgenticFurnitureListResult = {
    items,
    widthIn: manifest.widthIn,
    depthIn: manifest.depthIn,
    heightIn: manifest.heightIn ?? ROOM.height,
    roomType: manifest.roomType,
    theme: manifest.theme,
    vibe,
    warnings: [...manifest.warnings],
    source: 'room-scan',
  };
  return { list, sidecar: buildScanSidecarMap(manifest) };
}

/** Append client-side warning when analyze used a single still frame. */
export function appendSinglePhotoScanWarning(
  list: AgenticFurnitureListResult,
): AgenticFurnitureListResult {
  if (list.warnings.includes(ROOM_SCAN_SINGLE_PHOTO_WARNING)) return list;
  return {
    ...list,
    warnings: [...list.warnings, ROOM_SCAN_SINGLE_PHOTO_WARNING],
  };
}

/** Clamp footprint center so the item stays inside the rectangular floor (inches). */
export function clampScanFootprintCenter(
  widthIn: number,
  depthIn: number,
  pieceSize: [number, number, number],
  position: RoomScanPositionIn,
  rotationY = 0,
): RoomScanPositionIn {
  const halfW = pieceSize[0] / 2;
  const halfD = pieceSize[2] / 2;
  const rad = rotationY;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const extX = halfW * cos + halfD * sin;
  const extZ = halfW * sin + halfD * cos;
  const margin = 2;
  const minX = extX + margin;
  const maxX = Math.max(minX, widthIn - extX - margin);
  const minZ = extZ + margin;
  const maxZ = Math.max(minZ, depthIn - extZ - margin);
  return {
    x: Math.min(maxX, Math.max(minX, position.x)),
    z: Math.min(maxZ, Math.max(minZ, position.z)),
  };
}
