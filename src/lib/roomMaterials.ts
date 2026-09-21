/**
 * Curated room-surface material presets.
 * Textures are generated procedurally (CC0 / original) at runtime so the app
 * stays self-contained; swap in WebP files under public/materials/ later if desired.
 */

export type SurfaceKind = 'wall' | 'floor' | 'ceiling' | 'trim';

export type MaterialPresetId =
  | 'warmPlaster'
  | 'coolPlaster'
  | 'tealPaint'
  | 'whiteCeiling'
  | 'concrete'
  | 'lightOak'
  | 'darkOak'
  | 'carpet'
  | 'charcoalCarpet'
  | 'greySpeckleCarpet'
  | 'oatmealCarpet'
  | 'plaidCarpet'
  | 'whiteTrim'
  | 'blackTrim';

export interface MaterialMaps {
  /** Hex fallback / tint when no map is loaded. */
  color: string;
  roughness: number;
  metalness?: number;
  /** Real-world tile size in inches for UV repeat. */
  repeatInches: number;
  /** Procedural texture seed / style. */
  style: 'plaster' | 'concrete' | 'wood' | 'carpet' | 'speckledCarpet' | 'greySpeckleCarpet' | 'oatmealCarpet' | 'plaidCarpet' | 'paint' | 'trim';
  /** Optional subtle color variation amplitude 0..1. */
  variation?: number;
  /** Wood grain direction bias (radians in UV space). */
  grainAngle?: number;
  attribution: string;
}

export const MATERIAL_PRESETS: Record<MaterialPresetId, MaterialMaps> = {
  warmPlaster: {
    color: '#d8d0c2',
    roughness: 0.92,
    repeatInches: 48,
    style: 'plaster',
    variation: 0.04,
    attribution: 'Procedural plaster (original, CC0)',
  },
  coolPlaster: {
    color: '#cfc7b8',
    roughness: 0.94,
    repeatInches: 48,
    style: 'plaster',
    variation: 0.035,
    attribution: 'Procedural plaster (original, CC0)',
  },
  tealPaint: {
    color: '#1f4f4f',
    roughness: 0.78,
    repeatInches: 64,
    style: 'paint',
    variation: 0.025,
    attribution: 'Procedural paint (original, CC0)',
  },
  whiteCeiling: {
    color: '#f4f2ed',
    roughness: 0.96,
    repeatInches: 64,
    style: 'plaster',
    variation: 0.015,
    attribution: 'Procedural ceiling plaster (original, CC0)',
  },
  concrete: {
    color: '#9a9a96',
    roughness: 0.9,
    // Seamless soft tile — keep period large enough to hide repeats, small enough to stay sharp.
    repeatInches: 84,
    style: 'concrete',
    variation: 0.055,
    attribution: 'Procedural concrete (original, CC0)',
  },
  lightOak: {
    color: '#c4a574',
    roughness: 0.74,
    repeatInches: 24,
    style: 'wood',
    variation: 0.06,
    grainAngle: 0,
    attribution: 'Procedural light oak (original, CC0)',
  },
  darkOak: {
    color: '#835a3a',
    roughness: 0.76,
    repeatInches: 24,
    style: 'wood',
    variation: 0.06,
    grainAngle: 0,
    attribution: 'Procedural dark oak (original, CC0)',
  },
  carpet: {
    color: '#b8a898',
    roughness: 0.98,
    repeatInches: 18,
    style: 'carpet',
    variation: 0.05,
    attribution: 'Procedural carpet (original, CC0)',
  },
  charcoalCarpet: {
    color: '#788498',
    roughness: 0.98,
    repeatInches: 12,
    style: 'speckledCarpet',
    variation: 0.06,
    attribution: 'Procedural charcoal carpet (original, CC0)',
  },
  greySpeckleCarpet: {
    color: '#d4d0ca',
    roughness: 0.98,
    repeatInches: 10,
    style: 'greySpeckleCarpet',
    variation: 0.035,
    attribution: 'Procedural grey speckle carpet (original, CC0)',
  },
  oatmealCarpet: {
    color: '#c8b8a0',
    roughness: 0.98,
    repeatInches: 12,
    style: 'oatmealCarpet',
    variation: 0.05,
    attribution: 'Procedural oatmeal carpet (original, CC0)',
  },
  plaidCarpet: {
    color: '#949aa4',
    roughness: 0.97,
    repeatInches: 14,
    style: 'plaidCarpet',
    variation: 0.03,
    attribution: 'Procedural plaid carpet (original, CC0)',
  },
  whiteTrim: {
    color: '#f7f5f0',
    roughness: 0.55,
    repeatInches: 12,
    style: 'trim',
    variation: 0.01,
    attribution: 'Procedural painted trim (original, CC0)',
  },
  blackTrim: {
    color: '#1c1c1c',
    roughness: 0.48,
    repeatInches: 12,
    style: 'trim',
    variation: 0.008,
    attribution: 'Procedural painted trim (original, CC0)',
  },
};

export const WALL_PRESET_OPTIONS: MaterialPresetId[] = [
  'warmPlaster',
  'coolPlaster',
  'tealPaint',
];

export const FLOOR_PRESET_OPTIONS: MaterialPresetId[] = [
  'concrete',
  'lightOak',
  'darkOak',
  'carpet',
  'charcoalCarpet',
  'greySpeckleCarpet',
  'oatmealCarpet',
  'plaidCarpet',
];

export const CEILING_PRESET_OPTIONS: MaterialPresetId[] = ['whiteCeiling', 'warmPlaster'];

export const TRIM_PRESET_OPTIONS: MaterialPresetId[] = ['whiteTrim', 'blackTrim', 'darkOak', 'warmPlaster'];

export function isMaterialPresetId(v: unknown): v is MaterialPresetId {
  return typeof v === 'string' && v in MATERIAL_PRESETS;
}

export function materialLabel(id: MaterialPresetId): string {
  switch (id) {
    case 'warmPlaster':
      return 'Warm plaster';
    case 'coolPlaster':
      return 'Cool plaster';
    case 'tealPaint':
      return 'Teal paint';
    case 'whiteCeiling':
      return 'White ceiling';
    case 'concrete':
      return 'Concrete';
    case 'lightOak':
      return 'Light oak';
    case 'darkOak':
      return 'Dark oak';
    case 'carpet':
      return 'Carpet';
    case 'charcoalCarpet':
      return 'Charcoal carpet';
    case 'greySpeckleCarpet':
      return 'Grey speckle carpet';
    case 'oatmealCarpet':
      return 'Oatmeal carpet';
    case 'plaidCarpet':
      return 'Plaid carpet';
    case 'whiteTrim':
      return 'White trim';
    case 'blackTrim':
      return 'Black trim';
    default:
      return id;
  }
}
