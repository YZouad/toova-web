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
  /** Free wall paint color (hex). Multiplies the shared plaster texture. */
  wallColor: string;
  floorPreset: MaterialPresetId;
  ceilingPreset: MaterialPresetId;
  trimPreset: MaterialPresetId;
  /** Show visible ceiling mesh (shadow roof always casts when enclose is on). */
  showCeiling: boolean;
  /** Recessed can lights in the ceiling. */
  recessedLights: boolean;
  /** Show baseboard trim. */
  showBaseboards: boolean;
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

/** Field-tolerant parse; never returns null — always merges with defaults. */
export function parseAppearance(raw: unknown): RoomAppearance {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_APPEARANCE };
  const o = raw as Record<string, unknown>;
  const wallPreset = pickPreset(o.wallPreset, DEFAULT_APPEARANCE.wallPreset);
  const wallColor = isHexColor(o.wallColor)
    ? normalizeHex(o.wallColor)
    : normalizeHex(MATERIAL_PRESETS[wallPreset]?.color ?? DEFAULT_WALL_COLOR);
  return {
    wallPreset,
    wallColor,
    floorPreset: pickPreset(o.floorPreset, DEFAULT_APPEARANCE.floorPreset),
    ceilingPreset: pickPreset(o.ceilingPreset, DEFAULT_APPEARANCE.ceilingPreset),
    trimPreset: pickPreset(o.trimPreset, DEFAULT_APPEARANCE.trimPreset),
    showCeiling: o.showCeiling === undefined ? DEFAULT_APPEARANCE.showCeiling : o.showCeiling === true,
    recessedLights:
      o.recessedLights === undefined ? DEFAULT_APPEARANCE.recessedLights : o.recessedLights === true,
    showBaseboards:
      o.showBaseboards === undefined ? DEFAULT_APPEARANCE.showBaseboards : o.showBaseboards === true,
  };
}
