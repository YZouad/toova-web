import {
  itemSupportsTopColor,
  itemUsesCustomFinish,
  itemUsesTintColor,
} from './furnitureFinish';
import { isChecklistRug } from './checklistPublicGlbs';
import type { RoomAppearance } from './roomAppearance';
import { DEFAULT_APPEARANCE } from './roomAppearance';
import type { MaterialPresetId } from './roomMaterials';
import type { Item } from '../store';
import {
  resolveAgenticThemeProfile,
  type AgenticThemeProfile,
} from './agenticThemeProfile';

export type AgenticVibeId = 'warm' | 'neutral' | 'studio' | 'moody' | 'sage';

export interface AgenticVibeAppearancePartial extends Pick<
  RoomAppearance,
  'wallColor' | 'floorPreset'
> {
  trimPreset?: MaterialPresetId;
  recessedLights?: boolean;
}

/** Maps agentic vibe ids to room shell presets (see docs/agentic-room-generation-spec.md). */
export const AGENTIC_VIBE_APPEARANCE: Record<AgenticVibeId, AgenticVibeAppearancePartial> = {
  warm: { wallColor: '#d8d0c2', floorPreset: 'lightOak', trimPreset: 'whiteTrim' },
  neutral: { wallColor: '#cfc7b8', floorPreset: 'lightOak', trimPreset: 'whiteTrim' },
  studio: { wallColor: '#f2efe8', floorPreset: 'concrete', trimPreset: 'whiteTrim' },
  moody: {
    wallColor: '#3a3a3a',
    floorPreset: 'charcoalCarpet',
    trimPreset: 'blackTrim',
    recessedLights: true,
  },
  sage: {
    wallColor: '#6b7f6a',
    floorPreset: 'lightOak',
    trimPreset: 'whiteTrim',
    recessedLights: true,
  },
};

export interface AgenticVibeFurnishings {
  woodTint: string;
  shelfTint: string;
  chairTint: string;
  bedFrameTint: string;
  mattressColor: string;
  blanketColor: string;
  topColor: string;
  rugTint: string;
}

/** Builtin furniture tints aligned with each vibe (oak / laminate / charcoal / sage). */
export const AGENTIC_VIBE_FURNISHINGS: Record<AgenticVibeId, AgenticVibeFurnishings> = {
  warm: {
    woodTint: '#c4a574',
    shelfTint: '#a98662',
    chairTint: '#8a6f52',
    bedFrameTint: '#8a6f52',
    mattressColor: '#f1ece1',
    blanketColor: '#b89b7a',
    topColor: '#e8d8b0',
    rugTint: '#d8d0c2',
  },
  neutral: {
    woodTint: '#a98662',
    shelfTint: '#a98662',
    chairTint: '#4a5a6c',
    bedFrameTint: '#6b4f33',
    mattressColor: '#f1ece1',
    blanketColor: '#7a8fa3',
    topColor: '#e8d8b0',
    rugTint: '#cfc7b8',
  },
  studio: {
    woodTint: '#5c6166',
    shelfTint: '#5c6166',
    chairTint: '#4a5a6c',
    bedFrameTint: '#5c6166',
    mattressColor: '#d5d8df',
    blanketColor: '#9aa3ad',
    topColor: '#f2efe8',
    rugTint: '#b8bcc2',
  },
  moody: {
    woodTint: '#3a3a3a',
    shelfTint: '#3a3a3a',
    chairTint: '#4a4a4a',
    bedFrameTint: '#3a3a3a',
    mattressColor: '#4a4a4a',
    blanketColor: '#2c3a4f',
    topColor: '#5c6166',
    rugTint: '#4a4a4a',
  },
  sage: {
    woodTint: '#6b7f6a',
    shelfTint: '#6b7f6a',
    chairTint: '#5c6b58',
    bedFrameTint: '#6b4f33',
    mattressColor: '#7a8b73',
    blanketColor: '#5c7a6a',
    topColor: '#d8d0c2',
    rugTint: '#8a9a82',
  },
};

const VIBE_SYNONYMS: Record<string, AgenticVibeId> = {
  warm: 'warm',
  cozy: 'warm',
  neutral: 'neutral',
  studio: 'studio',
  office: 'studio',
  moody: 'moody',
  dark: 'moody',
  sage: 'sage',
  green: 'sage',
};

export function parseVibeToken(raw: string): AgenticVibeId | null {
  const key = raw.trim().toLowerCase();
  return VIBE_SYNONYMS[key] ?? null;
}

export function furnishingsForAgenticVibe(vibe?: AgenticVibeId): AgenticVibeFurnishings {
  return AGENTIC_VIBE_FURNISHINGS[vibe ?? 'neutral'];
}

export function appearanceForAgenticVibe(vibe?: AgenticVibeId): RoomAppearance {
  const partial = vibe ? AGENTIC_VIBE_APPEARANCE[vibe] : null;
  const picked = partial ?? AGENTIC_VIBE_APPEARANCE.neutral;
  return {
    ...DEFAULT_APPEARANCE,
    wallColor: picked.wallColor,
    floorPreset: picked.floorPreset,
    trimPreset: picked.trimPreset ?? DEFAULT_APPEARANCE.trimPreset,
    recessedLights: picked.recessedLights ?? DEFAULT_APPEARANCE.recessedLights,
  };
}

function woodTintForKind(
  kind: Item['kind'],
  palette: AgenticVibeFurnishings,
): string | undefined {
  if (kind === 'chair') return palette.chairTint;
  if (kind === 'shelf') return palette.shelfTint;
  if (kind === 'bed') return palette.bedFrameTint;
  if (itemUsesCustomFinish(kind)) return palette.woodTint;
  return undefined;
}

/** Paint builtin / rug placements to match the selected vibe palette. */
export function appearanceForAgenticTheme(
  theme?: string | null,
  prompt?: string | null,
): RoomAppearance | null {
  const profile = resolveAgenticThemeProfile(theme, prompt);
  if (!profile) return null;
  return {
    ...DEFAULT_APPEARANCE,
    wallColor: profile.appearance.wallColor,
    floorPreset: profile.appearance.floorPreset,
    trimPreset: profile.appearance.trimPreset ?? DEFAULT_APPEARANCE.trimPreset,
    recessedLights: profile.appearance.recessedLights ?? DEFAULT_APPEARANCE.recessedLights,
  };
}

export function applyAgenticThemeToItems(
  items: Item[],
  theme?: string | null,
  prompt?: string | null,
): Item[] {
  const profile = resolveAgenticThemeProfile(theme, prompt);
  if (!profile) return items;
  return applyPaletteToItems(items, profile.furnishings);
}

/** Rug tint inferred from a descriptive shopping query (e.g. "botanical rug"). */
export function rugTintFromQuery(query: string): string | null {
  const text = query.toLowerCase();
  if (/\b(botanical|sage|forest|nature|emerald|leaf|leaves|green)\b/.test(text)) return '#8a9a82';
  if (/\b(gothic|charcoal|black|dark|moody)\b/.test(text)) return '#3a3a3a';
  if (/\b(coastal|ocean|blue|aqua|teal)\b/.test(text)) return '#d8e0d8';
  if (/\b(minecraft|pixel|gaming|block)\b/.test(text)) return '#4a6038';
  if (/\b(warm|sunset|terracotta|rust)\b/.test(text)) return '#c4a574';
  if (/\b(pink|blush|rose)\b/.test(text)) return '#d8c0c0';
  return null;
}

/** Named finish on a shopping-list line. Wins over the room palette. */
export function explicitFinishFromLabel(
  label: string,
): { tintColor: string; topColor: string } | null {
  const text = label.toLowerCase();
  if (/\b(charcoal|black)\b/.test(text)) return { tintColor: '#3a3a3a', topColor: '#5c6166' };
  if (/\b(grays?|greys?)\b/.test(text)) return { tintColor: '#5c6166', topColor: '#f2efe8' };
  if (/\bwhites?\b/.test(text)) return { tintColor: '#f2efe8', topColor: '#f2efe8' };
  if (/\b(walnut|mahogany|cherry|brown)\b/.test(text)) {
    return { tintColor: '#6b4f33', topColor: '#8a6440' };
  }
  if (/\b(woods?|wooden|oak|maple|teak|bamboo)\b/.test(text)) {
    return { tintColor: '#8a6440', topColor: '#a98662' };
  }
  return null;
}

function applyPaletteToItems(items: Item[], palette: AgenticVibeFurnishings): Item[] {
  return items.map((item) => {
    if (item.kind === 'imported' && isChecklistRug(item)) {
      const namedRug = rugTintFromQuery(item.label ?? '');
      return { ...item, tintColor: namedRug ?? palette.rugTint };
    }
    if (!itemUsesTintColor(item.kind) && item.kind !== 'bed') return item;

    const next: Item = { ...item };
    const tint = woodTintForKind(item.kind, palette);
    if (tint) next.tintColor = tint;

    if (item.kind === 'bed') {
      next.mattressColor = palette.mattressColor;
      if (next.beddingEnabled !== false) {
        next.blanketColor = palette.blanketColor;
      }
    }

    if (itemSupportsTopColor(item)) {
      next.topColor = palette.topColor;
    }

    // "wood desk" / "brown desk pad" must not inherit a grey-white studio palette.
    const named = item.kind === 'imported' ? null : explicitFinishFromLabel(item.label);
    if (named) {
      if (tint || item.kind === 'bed') next.tintColor = named.tintColor;
      if (itemSupportsTopColor(item)) next.topColor = named.topColor;
    }

    return next;
  });
}

export function applyAgenticVibeToItems(items: Item[], vibe?: AgenticVibeId): Item[] {
  const palette = furnishingsForAgenticVibe(vibe);
  return applyPaletteToItems(items, palette);
}
