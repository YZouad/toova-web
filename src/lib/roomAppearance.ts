import {
  MATERIAL_PRESETS,
  isMaterialPresetId,
  type MaterialPresetId,
} from './roomMaterials';

export interface RoomAppearance {
  /**
   * Legacy wall finish id — texture is always plaster; color comes from wallColor.
   * Kept for older saved environments.
   */
  wallPreset: MaterialPresetId;
  /** Default paint for walls without a per-wall override. */
  wallColor: string;
  /** Optional per-wall paint overrides keyed by floor-plan wall id. */
  wallColors?: Record<string, string>;
  floorPreset: MaterialPresetId;
  ceilingPreset: MaterialPresetId;
  trimPreset: MaterialPresetId;
  /** Show visible ceiling mesh (shadow roof always casts when enclose is on). */
  showCeiling: boolean;
  /** Recessed can lights in the ceiling. */
  recessedLights: boolean;
  /** Show baseboard trim. */
  showBaseboards: boolean;
  /** User-uploaded floor photo texture (storage path). */
  floorTexturePath?: string;
  /** Signed URL for floorTexturePath — runtime only, not persisted. */
  floorTextureUrl?: string;
}

export const DEFAULT_WALL_COLOR = '#d8d0c2';

export const DEFAULT_APPEARANCE: RoomAppearance = {
  wallPreset: 'warmPlaster',
  wallColor: DEFAULT_WALL_COLOR,
  floorPreset: 'lightOak',
  ceilingPreset: 'whiteCeiling',
  trimPreset: 'whiteTrim',
  showCeiling: true,
  recessedLights: true,
  showBaseboards: true,
};

/** IKEA Kreativ–inspired teal walls + concrete floor. */
export const CATALOG_APPEARANCE: RoomAppearance = {
  wallPreset: 'warmPlaster',
  wallColor: '#1f4f4f',
  floorPreset: 'concrete',
  ceilingPreset: 'whiteCeiling',
  trimPreset: 'whiteTrim',
  showCeiling: true,
  recessedLights: true,
  showBaseboards: true,
};

/** Curated swatches — same plaster texture, different paint colors. */
export const WALL_COLOR_SWATCHES: { label: string; color: string }[] = [
  { label: 'Warm plaster', color: '#d8d0c2' },
  { label: 'Cool plaster', color: '#cfc7b8' },
  { label: 'Teal', color: '#1f4f4f' },
  { label: 'Sage', color: '#6b7f6a' },
  { label: 'Soft white', color: '#f2efe8' },
  { label: 'Yellow', color: '#e8d8b0' },
  { label: 'Charcoal', color: '#3a3a3a' },
];

function pickPreset(raw: unknown, fallback: MaterialPresetId): MaterialPresetId {
  return isMaterialPresetId(raw) ? raw : fallback;
}

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

function normalizeHex(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return `#${h.split('').map((c) => c + c).join('').toLowerCase()}`;
  }
  return `#${h.toLowerCase()}`;
}

export function storedFloorTexturePath(
  appearance: Pick<RoomAppearance, 'floorTexturePath'>,
): string | undefined {
  const path = appearance.floorTexturePath?.trim();
  return path || undefined;
}

export function assignFloorTextureUrl(
  appearance: RoomAppearance,
  path: string,
  url: string,
): void {
  if (appearance.floorTexturePath === path) appearance.floorTextureUrl = url;
}

/** Persisted appearance — strips signed URLs. */
export function serializeAppearance(appearance: RoomAppearance): RoomAppearance {
  const { floorTextureUrl: _url, ...rest } = appearance;
  return rest;
}

export function parseWallColors(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || !isHexColor(value)) continue;
    out[id] = normalizeHex(value);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Resolved paint for one wall — per-wall override, else the room default. */
export function wallPaintColor(appearance: RoomAppearance, wallId: string): string {
  return appearance.wallColors?.[wallId] ?? appearance.wallColor;
}

/**
 * Paint every wall (`wallId` omitted) or a single wall. Painting all walls
 * clears overrides so the room is uniform again.
 */
export function applyWallPaint(
  appearance: RoomAppearance,
  color: string,
  wallId?: string | null,
): RoomAppearance {
  const hex = isHexColor(color) ? normalizeHex(color) : appearance.wallColor;
  if (!wallId) {
    return { ...appearance, wallColor: hex, wallColors: undefined };
  }
  const next = { ...(appearance.wallColors ?? {}) };
  if (hex === appearance.wallColor) delete next[wallId];
  else next[wallId] = hex;
  const wallColors = Object.keys(next).length ? next : undefined;
  return { ...appearance, wallColors };
}

/** Drop overrides for walls that no longer exist in the floor plan. */
export function pruneWallColors(
  appearance: RoomAppearance,
  wallIds: Iterable<string>,
): RoomAppearance {
  const map = appearance.wallColors;
  if (!map) return appearance;
  const allowed = new Set(wallIds);
  const next: Record<string, string> = {};
  for (const [id, color] of Object.entries(map)) {
    if (allowed.has(id)) next[id] = color;
  }
  if (Object.keys(next).length === Object.keys(map).length) {
    let unchanged = true;
    for (const id of Object.keys(map)) {
      if (next[id] !== map[id]) {
        unchanged = false;
        break;
      }
    }
    if (unchanged) return appearance;
  }
  return { ...appearance, wallColors: Object.keys(next).length ? next : undefined };
}

export type WallFacingName = 'N' | 'S' | 'E' | 'W';

/** Compass abbreviation from a wall's outward (+X east, +Z south). */
export function wallFacingName(outwardX: number, outwardZ: number): WallFacingName {
  if (Math.abs(outwardZ) >= Math.abs(outwardX)) {
    return outwardZ >= 0 ? 'S' : 'N';
  }
  return outwardX >= 0 ? 'E' : 'W';
}

const WALL_FACING_FULL: Record<WallFacingName, string> = {
  N: 'North',
  S: 'South',
  E: 'East',
  W: 'West',
};

/** Full compass word for tooltips / a11y (chips show the abbreviation). */
export function wallFacingFullName(facing: WallFacingName): string {
  return WALL_FACING_FULL[facing];
}

/** Stable UI labels — "N", or "S 1" / "S 2" when several face the same way. */
export function uniqueWallLabels(
  walls: readonly { id: string; outward: readonly [number, number] }[],
): { id: string; label: string; title: string }[] {
  const facings = walls.map((w) => wallFacingName(w.outward[0], w.outward[1]));
  const counts = new Map<string, number>();
  for (const facing of facings) counts.set(facing, (counts.get(facing) ?? 0) + 1);
  const seen = new Map<string, number>();
  return walls.map((w, i) => {
    const facing = facings[i]!;
    const full = wallFacingFullName(facing);
    if ((counts.get(facing) ?? 0) <= 1) {
      return { id: w.id, label: facing, title: full };
    }
    const n = (seen.get(facing) ?? 0) + 1;
    seen.set(facing, n);
    return { id: w.id, label: `${facing} ${n}`, title: `${full} ${n}` };
  });
}

/** Field-tolerant parse; never returns null — always merges with defaults. */
export function parseAppearance(raw: unknown): RoomAppearance {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_APPEARANCE };
  const o = raw as Record<string, unknown>;
  const wallPreset = pickPreset(o.wallPreset, DEFAULT_APPEARANCE.wallPreset);
  const wallColor = isHexColor(o.wallColor)
    ? normalizeHex(o.wallColor)
    : normalizeHex(MATERIAL_PRESETS[wallPreset]?.color ?? DEFAULT_WALL_COLOR);
  const wallColors = parseWallColors(o.wallColors);
  const floorTexturePath =
    typeof o.floorTexturePath === 'string' && o.floorTexturePath.trim()
      ? o.floorTexturePath.trim()
      : undefined;
  return {
    wallPreset,
    wallColor,
    ...(wallColors ? { wallColors } : {}),
    floorPreset: pickPreset(o.floorPreset, DEFAULT_APPEARANCE.floorPreset),
    ceilingPreset: pickPreset(o.ceilingPreset, DEFAULT_APPEARANCE.ceilingPreset),
    trimPreset: pickPreset(o.trimPreset, DEFAULT_APPEARANCE.trimPreset),
    showCeiling: o.showCeiling === undefined ? DEFAULT_APPEARANCE.showCeiling : o.showCeiling === true,
    recessedLights:
      o.recessedLights === undefined ? DEFAULT_APPEARANCE.recessedLights : o.recessedLights === true,
    showBaseboards:
      o.showBaseboards === undefined ? DEFAULT_APPEARANCE.showBaseboards : o.showBaseboards === true,
    ...(floorTexturePath ? { floorTexturePath } : {}),
  };
}
