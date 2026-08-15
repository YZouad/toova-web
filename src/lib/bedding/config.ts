import {
  DEFAULT_COMFORTER_COLOR_ID,
  DEFAULT_COMFORTER_PATTERN_ID,
  DEFAULT_PILLOW_COLOR_ID,
  DEFAULT_PILLOW_PATTERN_ID,
  DEFAULT_PILLOW_SIZE,
  DEFAULT_SHEET_COLOR_ID,
  DEFAULT_SHEET_PATTERN_ID,
  findColor,
  COMFORTER_COLORS,
} from './catalog';
import type { BeddingConfig, BeddingConfigPatch, BeddingPillow, PillowSizeId } from './types';

export const DEFAULT_BEDDING_CONFIG: BeddingConfig = {
  version: 1,
  topper: { enabled: false },
  sheets: {
    enabled: false,
    colorId: DEFAULT_SHEET_COLOR_ID,
    patternId: DEFAULT_SHEET_PATTERN_ID,
  },
  comforter: {
    enabled: false,
    colorId: DEFAULT_COMFORTER_COLOR_ID,
    patternId: DEFAULT_COMFORTER_PATTERN_ID,
    drapeInches: 6,
  },
  pillows: { enabled: false, items: [] },
};

export function newPillowId(): string {
  return `pillow-${crypto.randomUUID().slice(0, 8)}`;
}

const LEGACY_PILLOW_SIZE_MAP: Record<string, PillowSizeId> = {
  small: 'decorative',
  large: 'queen',
  standard: 'standard',
  decorative: 'decorative',
  queen: 'queen',
  king: 'king',
  euro: 'euro',
};

export function normalizePillowSize(raw: unknown): PillowSizeId {
  if (typeof raw === 'string' && raw in LEGACY_PILLOW_SIZE_MAP) {
    return LEGACY_PILLOW_SIZE_MAP[raw];
  }
  return DEFAULT_PILLOW_SIZE;
}

export function createDefaultPillow(): BeddingPillow {
  return {
    id: newPillowId(),
    size: DEFAULT_PILLOW_SIZE,
    colorId: DEFAULT_PILLOW_COLOR_ID,
    patternId: DEFAULT_PILLOW_PATTERN_ID,
  };
}

export function createDefaultPillows(count = 2): BeddingPillow[] {
  return Array.from({ length: count }, () => createDefaultPillow());
}

export function mergeBeddingConfig(
  base: BeddingConfig,
  patch: BeddingConfigPatch,
): BeddingConfig {
  return {
    version: 1,
    topper: { ...base.topper, ...patch.topper },
    sheets: { ...base.sheets, ...patch.sheets },
    comforter: { ...base.comforter, ...patch.comforter },
    pillows: {
      ...base.pillows,
      ...patch.pillows,
      items: patch.pillows?.items ?? base.pillows.items,
    },
  };
}

export function resolveBeddingConfig(item: {
  beddingConfig?: BeddingConfig;
  beddingEnabled?: boolean;
  blanketColor?: string;
}): BeddingConfig {
  if (item.beddingConfig) return item.beddingConfig;

  if (item.beddingEnabled) {
    const hex = item.blanketColor?.trim();
    const colorId =
      hex != null
        ? COMFORTER_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.id ??
          DEFAULT_COMFORTER_COLOR_ID
        : DEFAULT_COMFORTER_COLOR_ID;

    return {
      version: 1,
      topper: { enabled: false },
      sheets: {
        enabled: false,
        colorId: DEFAULT_SHEET_COLOR_ID,
        patternId: DEFAULT_SHEET_PATTERN_ID,
      },
      comforter: {
        enabled: true,
        colorId,
        patternId: DEFAULT_COMFORTER_PATTERN_ID,
        drapeInches: 6,
      },
      pillows: { enabled: true, items: createDefaultPillows(1) },
    };
  }

  return DEFAULT_BEDDING_CONFIG;
}

export function isAnyBeddingLayerEnabled(config: BeddingConfig): boolean {
  return (
    config.topper.enabled ||
    config.sheets.enabled ||
    config.comforter.enabled ||
    (config.pillows.enabled && config.pillows.items.length > 0)
  );
}

export function comforterHexFromConfig(config: BeddingConfig): string | undefined {
  if (!config.comforter.enabled) return undefined;
  return findColor(COMFORTER_COLORS, config.comforter.colorId, DEFAULT_COMFORTER_COLOR_ID).hex;
}

export function parseBeddingConfig(raw: unknown): BeddingConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return undefined;

  const topper = o.topper as Record<string, unknown> | undefined;
  const sheets = o.sheets as Record<string, unknown> | undefined;
  const comforter = o.comforter as Record<string, unknown> | undefined;
  const pillows = o.pillows as Record<string, unknown> | undefined;

  if (!topper || !sheets || !comforter || !pillows) return undefined;

  const pillowItems = Array.isArray(pillows.items)
    ? pillows.items
        .map((p) => {
          if (!p || typeof p !== 'object') return null;
          const pi = p as Record<string, unknown>;
          if (typeof pi.id !== 'string') return null;
          return {
            id: pi.id,
            size: normalizePillowSize(pi.size),
            colorId: typeof pi.colorId === 'string' ? pi.colorId : DEFAULT_PILLOW_COLOR_ID,
            patternId:
              typeof pi.patternId === 'string' ? pi.patternId : DEFAULT_PILLOW_PATTERN_ID,
            offsetX:
              typeof pi.offsetX === 'number' && Number.isFinite(pi.offsetX) ? pi.offsetX : 0,
            offsetZ:
              typeof pi.offsetZ === 'number' && Number.isFinite(pi.offsetZ) ? pi.offsetZ : 0,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p != null)
    : [];

  return {
    version: 1,
    topper: { enabled: topper.enabled === true },
    sheets: {
      enabled: sheets.enabled === true,
      colorId: typeof sheets.colorId === 'string' ? sheets.colorId : DEFAULT_SHEET_COLOR_ID,
      patternId:
        typeof sheets.patternId === 'string' ? sheets.patternId : DEFAULT_SHEET_PATTERN_ID,
    },
    comforter: {
      enabled: comforter.enabled === true,
      colorId:
        typeof comforter.colorId === 'string' ? comforter.colorId : DEFAULT_COMFORTER_COLOR_ID,
      patternId:
        typeof comforter.patternId === 'string'
          ? comforter.patternId
          : DEFAULT_COMFORTER_PATTERN_ID,
      drapeInches:
        typeof comforter.drapeInches === 'number' && Number.isFinite(comforter.drapeInches)
          ? comforter.drapeInches
          : 6,
    },
    pillows: {
      enabled: pillows.enabled === true,
      items: pillowItems,
    },
  };
}
