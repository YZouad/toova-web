import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import {
  ensureAgenticSchemeColors,
  furnishingsFromColorScheme,
  normalizeHexColor,
} from './agenticColorScheme';
import type { AgenticVibeFurnishings } from './agenticRoomVibe';
import { applyAgenticPaletteToItems } from './agenticRoomVibe';
import type { RoomAppearance } from './roomAppearance';
import { DEFAULT_APPEARANCE } from './roomAppearance';
import {
  FLOOR_PRESET_OPTIONS,
  MATERIAL_PRESETS,
  isMaterialPresetId,
  type MaterialPresetId,
} from './roomMaterials';
import type { Item } from '../store';
import { isChecklistRug } from './checklistPublicGlbs';

export interface RoomScanBeddingColors {
  blanket?: string;
  accent?: string;
}

export interface RoomScanAppearance {
  wallColor?: string;
  floorPreset?: MaterialPresetId;
  colorScheme?: string[];
  rugColor?: string;
  beddingColors?: RoomScanBeddingColors;
  /** True when vision noted herringbone / complex floor pattern. */
  floorPatternApproximated?: boolean;
}

export const ROOM_SCAN_FLOOR_PATTERN_WARNING =
  'Floor pattern approximated; pick a floor preset or upload a custom floor photo in the designer for a closer match.';

function hexToRgb(hex: string): [number, number, number] | null {
  const n = normalizeHexColor(hex);
  if (!n) return null;
  return [
    Number.parseInt(n.slice(1, 3), 16),
    Number.parseInt(n.slice(3, 5), 16),
    Number.parseInt(n.slice(5, 7), 16),
  ];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/** Pick closest procedural floor preset for an sampled RGB color. */
export function matchFloorPresetFromRgb(rgb: [number, number, number]): MaterialPresetId {
  let best: MaterialPresetId = 'lightOak';
  let bestDist = Number.POSITIVE_INFINITY;
  for (const id of FLOOR_PRESET_OPTIONS) {
    const preset = MATERIAL_PRESETS[id];
    const target = hexToRgb(preset.color);
    if (!target) continue;
    const d = colorDistance(rgb, target);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

function averageRgb(pixels: Uint8ClampedArray): [number, number, number] | null {
  if (pixels.length < 4) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    r += pixels[i]!;
    g += pixels[i + 1]!;
    b += pixels[i + 2]!;
    n += 1;
  }
  if (n === 0) return null;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function sampleRegion(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number] | null {
  const sx = Math.max(0, Math.floor(x0 * w));
  const sy = Math.max(0, Math.floor(y0 * h));
  const sw = Math.max(1, Math.floor((x1 - x0) * w));
  const sh = Math.max(1, Math.floor((y1 - y0) * h));
  const data = ctx.getImageData(sx, sy, sw, sh);
  return averageRgb(data.data);
}

function rgbToHex(rgb: [number, number, number]): string {
  const c = (n: number) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0');
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

/** Sample wall / floor / center rug colors from a scan JPEG (browser only). */
export async function sampleAppearanceFromScanFrame(
  jpegDataUrl: string,
): Promise<RoomScanAppearance> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        reject(new Error('Could not sample colors from photo'));
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not sample colors from photo'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const wallRgb = sampleRegion(ctx, w, h, 0.05, 0.02, 0.95, 0.22);
      const floorRgb = sampleRegion(ctx, w, h, 0.05, 0.72, 0.95, 0.98);
      const rugRgb = sampleRegion(ctx, w, h, 0.25, 0.55, 0.75, 0.85);
      const accentRgb = sampleRegion(ctx, w, h, 0.1, 0.35, 0.9, 0.65);

      const wallColor = wallRgb ? rgbToHex(wallRgb) : undefined;
      const floorPreset = floorRgb ? matchFloorPresetFromRgb(floorRgb) : undefined;
      const rugColor = rugRgb ? rgbToHex(rugRgb) : undefined;
      const woodRgb = accentRgb ?? floorRgb;
      const wood = woodRgb ? rgbToHex(woodRgb) : undefined;
      const accent = rugRgb ? rgbToHex(rugRgb) : wood;

      const colorScheme =
        wallColor && wood && accent
          ? ensureAgenticSchemeColors([wallColor, wood, accent, accent, accent])
          : undefined;

      resolve({
        wallColor,
        floorPreset,
        colorScheme,
        rugColor,
        beddingColors:
          accent && rugColor
            ? { blanket: rugColor, accent: accentRgb ? rgbToHex(accentRgb) : accent }
            : undefined,
      });
    };
    img.onerror = () => reject(new Error('Could not load photo for color sampling'));
    img.src = jpegDataUrl;
  });
}

export function mergeScanAppearance(
  vision: RoomScanAppearance | undefined,
  sampled: RoomScanAppearance | undefined,
): RoomScanAppearance {
  const out: RoomScanAppearance = { ...(sampled ?? {}) };
  if (vision?.wallColor) out.wallColor = vision.wallColor;
  if (vision?.floorPreset) out.floorPreset = vision.floorPreset;
  if (vision?.colorScheme?.length) out.colorScheme = vision.colorScheme;
  else if (!out.colorScheme?.length && vision?.wallColor) {
    out.colorScheme = ensureAgenticSchemeColors([vision.wallColor]);
  }
  if (vision?.rugColor) out.rugColor = vision.rugColor;
  if (vision?.beddingColors) out.beddingColors = { ...vision.beddingColors };
  if (vision?.floorPatternApproximated) out.floorPatternApproximated = true;
  return out;
}

export function mergeScanAppearanceIntoEnvironment(
  base: RoomAppearance,
  scan: RoomScanAppearance | undefined,
  colorScheme?: string[] | null,
): RoomAppearance {
  if (!scan && !colorScheme?.length) return base;
  const scheme = colorScheme?.length ? colorScheme : scan?.colorScheme;
  const wall =
    normalizeHexColor(scheme?.[0] ?? '') ??
    normalizeHexColor(scan?.wallColor ?? '') ??
    base.wallColor;
  const floorPreset =
    scan?.floorPreset && isMaterialPresetId(scan.floorPreset)
      ? scan.floorPreset
      : base.floorPreset;
  return {
    ...base,
    wallColor: wall,
    floorPreset,
  };
}

export function effectiveScanColorScheme(
  list: AgenticFurnitureListResult,
  scanAppearance?: RoomScanAppearance | null,
): string[] | undefined {
  if (list.colorScheme?.length) return list.colorScheme;
  if (scanAppearance?.colorScheme?.length) return scanAppearance.colorScheme;
  return undefined;
}

export function applyScanAppearanceToList(
  list: AgenticFurnitureListResult,
  scanAppearance: RoomScanAppearance,
): AgenticFurnitureListResult {
  const colorScheme = scanAppearance.colorScheme?.length
    ? scanAppearance.colorScheme
    : list.colorScheme;
  const warnings = [...list.warnings];
  if (
    scanAppearance.floorPatternApproximated &&
    !warnings.includes(ROOM_SCAN_FLOOR_PATTERN_WARNING)
  ) {
    warnings.push(ROOM_SCAN_FLOOR_PATTERN_WARNING);
  }
  return {
    ...list,
    colorScheme,
    scanAppearance,
    warnings,
  };
}

/** Override rug / bedding tints after generic palette application. */
export function applyScanTintsToItems(
  items: Item[],
  scan: RoomScanAppearance | undefined,
  palette: AgenticVibeFurnishings,
): Item[] {
  let next = applyAgenticPaletteToItems(items, palette);
  if (!scan) return next;
  next = next.map((item) => {
    if (item.kind === 'imported' && isChecklistRug(item) && scan.rugColor) {
      const hex = normalizeHexColor(scan.rugColor);
      if (hex) return { ...item, tintColor: hex };
    }
    if (item.kind === 'bed') {
      const blanket = normalizeHexColor(scan.beddingColors?.blanket ?? '');
      const accent = normalizeHexColor(scan.beddingColors?.accent ?? '');
      if (blanket || accent) {
        return {
          ...item,
          ...(blanket && item.beddingEnabled !== false ? { blanketColor: blanket } : {}),
          ...(accent ? { tintColor: accent } : {}),
        };
      }
    }
    return item;
  });
  return next;
}

export function paletteFromScan(
  base: AgenticVibeFurnishings,
  colorScheme: string[] | undefined,
): AgenticVibeFurnishings {
  if (!colorScheme?.length) return base;
  return furnishingsFromColorScheme(colorScheme, base);
}

export function parseManifestAppearance(raw: unknown): RoomScanAppearance | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const wallColor = typeof o.wallColor === 'string' ? normalizeHexColor(o.wallColor) : undefined;
  const floorRaw = o.floorPreset;
  const floorPreset =
    typeof floorRaw === 'string' && isMaterialPresetId(floorRaw) ? floorRaw : undefined;
  const colorScheme = Array.isArray(o.colorScheme)
    ? o.colorScheme
        .map((c) => (typeof c === 'string' ? normalizeHexColor(c) : null))
        .filter((c): c is string => !!c)
    : undefined;
  const rugColor = typeof o.rugColor === 'string' ? normalizeHexColor(o.rugColor) : undefined;
  let beddingColors: RoomScanBeddingColors | undefined;
  if (o.beddingColors && typeof o.beddingColors === 'object') {
    const b = o.beddingColors as Record<string, unknown>;
    beddingColors = {
      blanket: typeof b.blanket === 'string' ? normalizeHexColor(b.blanket) ?? undefined : undefined,
      accent: typeof b.accent === 'string' ? normalizeHexColor(b.accent) ?? undefined : undefined,
    };
  }
  const floorPatternApproximated = o.floorPatternApproximated === true;
  if (
    !wallColor &&
    !floorPreset &&
    !colorScheme?.length &&
    !rugColor &&
    !beddingColors?.blanket &&
    !beddingColors?.accent
  ) {
    return undefined;
  }
  return {
    wallColor: wallColor ?? undefined,
    floorPreset,
    colorScheme: colorScheme?.length ? colorScheme : undefined,
    rugColor: rugColor ?? undefined,
    beddingColors,
    floorPatternApproximated: floorPatternApproximated || undefined,
  };
}
