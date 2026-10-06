import type { MaterialPresetId } from './roomMaterials';
import type { AgenticVibeAppearancePartial, AgenticVibeFurnishings } from './agenticRoomVibe';
import { normalizeSearchText, tokenize } from './designerSearch';

export type AgenticThemeProfileId =
  | 'blockGaming'
  | 'gothic'
  | 'coastal'
  | 'nature'
  | 'space'
  | 'vintage'
  | 'japanese'
  | 'minimalist'
  | 'warm'
  | 'studio';

export interface AgenticThemeProfile {
  id: AgenticThemeProfileId;
  label: string;
  /** Preferred poster bank kinds (first match wins when scoring ties). */
  preferredPosterKinds: string[];
  appearance: AgenticVibeAppearancePartial;
  furnishings: AgenticVibeFurnishings;
  /** Generic poster label pattern for LLM prompts. */
  posterPromptExample: string;
}

const PROFILES: Record<AgenticThemeProfileId, AgenticThemeProfile> = {
  blockGaming: {
    id: 'blockGaming',
    label: 'Block gaming',
    preferredPosterKinds: [
      'poster-pixel-blocks',
      'poster-ascii-gaming',
      'poster-retro-arcade',
      'poster-pixel-landscape',
    ],
    appearance: {
      wallColor: '#5c7f3a',
      floorPreset: 'darkOak',
      trimPreset: 'darkOak',
    },
    furnishings: {
      woodTint: '#6b4f33',
      shelfTint: '#5a4030',
      chairTint: '#4a4030',
      bedFrameTint: '#6b4f33',
      mattressColor: '#e8e4d8',
      blanketColor: '#5c7a4a',
      topColor: '#7a9a5a',
      rugTint: '#4a6038',
    },
    posterPromptExample: 'Green pixel block landscape wall poster',
  },
  gothic: {
    id: 'gothic',
    label: 'Gothic',
    preferredPosterKinds: ['poster-gothic-cathedral', 'poster-moody-charcoal'],
    appearance: {
      wallColor: '#2a2a2e',
      floorPreset: 'charcoalCarpet',
      trimPreset: 'blackTrim',
      recessedLights: true,
    },
    furnishings: {
      woodTint: '#2a2420',
      shelfTint: '#1f1a18',
      chairTint: '#3a3a3a',
      bedFrameTint: '#2a2420',
      mattressColor: '#4a4a4a',
      blanketColor: '#2c3a4f',
      topColor: '#5c6166',
      rugTint: '#3a3a3a',
    },
    posterPromptExample: 'Gothic cathedral architecture wall poster',
  },
  coastal: {
    id: 'coastal',
    label: 'Coastal',
    preferredPosterKinds: ['poster-coastal-beach', 'poster-warm-sunset', 'poster-japanese-woodblock'],
    appearance: {
      wallColor: '#c8ddd8',
      floorPreset: 'lightOak',
      trimPreset: 'whiteTrim',
    },
    furnishings: {
      woodTint: '#c4a574',
      shelfTint: '#a98662',
      chairTint: '#6a8a9a',
      bedFrameTint: '#8a6f52',
      mattressColor: '#f1ece1',
      blanketColor: '#9ab8c8',
      topColor: '#e8d8b0',
      rugTint: '#d8e0d8',
    },
    posterPromptExample: 'Coastal beach shoreline wall poster',
  },
  nature: {
    id: 'nature',
    label: 'Nature',
    preferredPosterKinds: ['poster-sage-forest', 'poster-botanical-flowers', 'poster-mountain-landscape'],
    appearance: {
      wallColor: '#6b7f6a',
      floorPreset: 'lightOak',
      trimPreset: 'whiteTrim',
    },
    furnishings: {
      woodTint: '#6b7f6a',
      shelfTint: '#5c6b58',
      chairTint: '#5c6b58',
      bedFrameTint: '#6b4f33',
      mattressColor: '#7a8b73',
      blanketColor: '#5c7a6a',
      topColor: '#d8d0c2',
      rugTint: '#8a9a82',
    },
    posterPromptExample: 'Sage green forest nature wall poster',
  },
  space: {
    id: 'space',
    label: 'Space',
    preferredPosterKinds: ['poster-space-nebula'],
    appearance: {
      wallColor: '#1a2238',
      floorPreset: 'charcoalCarpet',
      trimPreset: 'blackTrim',
      recessedLights: true,
    },
    furnishings: {
      woodTint: '#3a3a4a',
      shelfTint: '#3a3a4a',
      chairTint: '#4a5a6c',
      bedFrameTint: '#3a3a4a',
      mattressColor: '#4a4a5a',
      blanketColor: '#2c3a5f',
      topColor: '#5c6166',
      rugTint: '#3a3a4a',
    },
    posterPromptExample: 'Deep space nebula astronomy wall poster',
  },
  vintage: {
    id: 'vintage',
    label: 'Vintage',
    preferredPosterKinds: ['poster-vintage-travel'],
    appearance: {
      wallColor: '#d8d0c2',
      floorPreset: 'darkOak',
      trimPreset: 'whiteTrim',
    },
    furnishings: {
      woodTint: '#835a3a',
      shelfTint: '#6b4f33',
      chairTint: '#6b4f33',
      bedFrameTint: '#6b4f33',
      mattressColor: '#f1ece1',
      blanketColor: '#b87a5a',
      topColor: '#e8d8b0',
      rugTint: '#c4a574',
    },
    posterPromptExample: 'Vintage travel city wall poster',
  },
  japanese: {
    id: 'japanese',
    label: 'Japanese',
    preferredPosterKinds: ['poster-japanese-woodblock'],
    appearance: {
      wallColor: '#f0ebe0',
      floorPreset: 'darkOak',
      trimPreset: 'whiteTrim',
    },
    furnishings: {
      woodTint: '#4a4038',
      shelfTint: '#4a4038',
      chairTint: '#4a4038',
      bedFrameTint: '#4a4038',
      mattressColor: '#f1ece1',
      blanketColor: '#8a4a4a',
      topColor: '#d8d0c2',
      rugTint: '#c4a574',
    },
    posterPromptExample: 'Japanese woodblock wave landscape wall poster',
  },
  minimalist: {
    id: 'minimalist',
    label: 'Minimalist',
    preferredPosterKinds: ['poster-minimalist-lines', 'poster-neutral-abstract', 'poster-studio-geometric'],
    appearance: {
      wallColor: '#e8e4dc',
      floorPreset: 'concrete',
      trimPreset: 'whiteTrim',
    },
    furnishings: {
      woodTint: '#5c6166',
      shelfTint: '#5c6166',
      chairTint: '#4a5a6c',
      bedFrameTint: '#5c6166',
      mattressColor: '#f1ece1',
      blanketColor: '#9aa3ad',
      topColor: '#f2efe8',
      rugTint: '#cfc7b8',
    },
    posterPromptExample: 'Minimalist geometric line art wall poster',
  },
  warm: {
    id: 'warm',
    label: 'Warm',
    preferredPosterKinds: ['poster-warm-sunset', 'poster-neutral-abstract'],
    appearance: {
      wallColor: '#d8d0c2',
      floorPreset: 'lightOak',
      trimPreset: 'whiteTrim',
    },
    furnishings: {
      woodTint: '#c4a574',
      shelfTint: '#a98662',
      chairTint: '#8a6f52',
      bedFrameTint: '#8a6f52',
      mattressColor: '#f1ece1',
      blanketColor: '#b89b7a',
      topColor: '#e8d8b0',
      rugTint: '#d8d0c2',
    },
    posterPromptExample: 'Warm sunset beach landscape wall poster',
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    preferredPosterKinds: ['poster-studio-geometric', 'poster-minimalist-lines'],
    appearance: {
      wallColor: '#f2efe8',
      floorPreset: 'concrete',
      trimPreset: 'whiteTrim',
    },
    furnishings: {
      woodTint: '#5c6166',
      shelfTint: '#5c6166',
      chairTint: '#4a5a6c',
      bedFrameTint: '#5c6166',
      mattressColor: '#d5d8df',
      blanketColor: '#9aa3ad',
      topColor: '#f2efe8',
      rugTint: '#b8bcc2',
    },
    posterPromptExample: 'Studio geometric abstract wall poster',
  },
};

/** Negative patterns — must not match block gaming. */
const BLOCK_GAMING_NEGATIVES = [
  /\bcraft\s+room\b/i,
  /\barts?\s+and\s+crafts\b/i,
  /\bcrafting\b/i,
  /\bsewing\b/i,
  /\bscrapbook\b/i,
];

interface ProfileSignal {
  id: AgenticThemeProfileId;
  patterns: RegExp[];
  weight: number;
}

const PROFILE_SIGNALS: ProfileSignal[] = [
  {
    id: 'blockGaming',
    weight: 10,
    patterns: [
      /\bminecraft\b/i,
      /\bminecraft[\s-]?style\b/i,
      /\bblock[\s-]?building\b/i,
      /\bblocky\b/i,
      /\bvoxel\b/i,
      /\bpixel[\s-]?sandbox\b/i,
      /\b8[\s-]?bit\b/i,
      /\bcrafting[\s-]?game\b/i,
      /\bretro[\s-]?pixel[\s-]?gaming\b/i,
    ],
  },
  {
    id: 'gothic',
    weight: 10,
    patterns: [
      /\bgothic\b/i,
      /\bdark[\s-]?academia\b/i,
      /\bmedieval\b/i,
      /\bcathedral\b/i,
      /\bmoody[\s-]?gothic\b/i,
    ],
  },
  {
    id: 'coastal',
    weight: 10,
    patterns: [/\bcoastal\b/i, /\bbeach\b/i, /\bnautical\b/i, /\bocean\b/i, /\bshore\b/i],
  },
  {
    id: 'nature',
    weight: 8,
    patterns: [
      /\bbotanical\b/i,
      /\bsage\b/i,
      /\bforest\b/i,
      /\bwoodland\b/i,
      /\bmountain\b/i,
      /\boutdoors\b/i,
    ],
  },
  {
    id: 'space',
    weight: 10,
    patterns: [/\bspace\b/i, /\bastronomy\b/i, /\bcosmic\b/i, /\bsci[\s-]?fi\b/i, /\bnebula\b/i],
  },
  {
    id: 'vintage',
    weight: 8,
    patterns: [/\bvintage\b/i, /\bretro[\s-]?travel\b/i, /\bold[\s-]?world\b/i],
  },
  {
    id: 'japanese',
    weight: 10,
    patterns: [
      /\bjapanese\b/i,
      /\bukiyo[\s-]?e\b/i,
      /\bwoodblock\b/i,
      /\bzen\b/i,
      /\banime[\s-]?style\b/i,
    ],
  },
  {
    id: 'minimalist',
    weight: 8,
    patterns: [/\bminimalist\b/i, /\bminimal\b/i, /\bneutral\b/i, /\bcalm\b/i, /\bline[\s-]?art\b/i],
  },
  {
    id: 'warm',
    weight: 8,
    patterns: [/\bwarm\b/i, /\bcozy\b/i, /\bsunset\b/i, /\bgolden\b/i],
  },
  {
    id: 'studio',
    weight: 8,
    patterns: [/\bstudio\b/i, /\bwork[\s-]?space\b/i, /\bmodern[\s-]?geometric\b/i],
  },
];

function scoreTextForProfile(text: string, signal: ProfileSignal): number {
  if (signal.id === 'blockGaming' && BLOCK_GAMING_NEGATIVES.some((re) => re.test(text))) {
    return 0;
  }
  let score = 0;
  for (const re of signal.patterns) {
    if (re.test(text)) score += signal.weight;
  }
  return score;
}

const EXPLICIT_THEME_SKIP = new Set([
  'warm',
  'cozy',
  'neutral',
  'studio',
  'office',
  'moody',
  'minimal',
  'minimalist',
  'modern',
  'simple',
  'contemporary',
  'clean',
  'basic',
]);

function explicitThemeText(theme?: string | null): string | null {
  const trimmed = theme?.trim() ?? '';
  if (!trimmed || EXPLICIT_THEME_SKIP.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

export function resolveAgenticThemeProfile(
  theme?: string | null,
  prompt?: string | null,
): AgenticThemeProfile | null {
  const explicitTheme = explicitThemeText(theme);
  if (explicitTheme) {
    const themeText = normalizeSearchText(explicitTheme);
    let bestFromTheme: { id: AgenticThemeProfileId; score: number } | null = null;
    for (const signal of PROFILE_SIGNALS) {
      const score = scoreTextForProfile(themeText, signal);
      if (score > 0 && (!bestFromTheme || score > bestFromTheme.score)) {
        bestFromTheme = { id: signal.id, score };
      }
    }
    if (bestFromTheme) return PROFILES[bestFromTheme.id];
  }

  const combined = normalizeSearchText(`${theme ?? ''} ${prompt ?? ''}`);
  if (!combined.trim()) return PROFILES.minimalist;

  let best: { id: AgenticThemeProfileId; score: number } | null = null;
  for (const signal of PROFILE_SIGNALS) {
    const score = scoreTextForProfile(combined, signal);
    if (score > 0 && (!best || score > best.score)) {
      best = { id: signal.id, score };
    }
  }

  if (!best) {
    if (/\b(wooden|woods?|oak|walnut|mahogany|brown)\b/i.test(combined)) return PROFILES.warm;
    return PROFILES.minimalist;
  }
  return PROFILES[best.id];
}

export function themeProfileById(id: AgenticThemeProfileId): AgenticThemeProfile {
  return PROFILES[id];
}

export function profilePosterKindBoost(
  profile: AgenticThemeProfile | null,
  posterKind: string,
): number {
  if (!profile) return 0;
  const idx = profile.preferredPosterKinds.indexOf(posterKind);
  if (idx < 0) return 0;
  return 40 - idx * 5;
}

export const AGENTIC_THEME_SUGGESTIONS = [
  {
    prompt: 'voxel gaming dorm — twin xl bed, desk, maybe $700 total',
    profileId: 'blockGaming' as const,
  },
  {
    prompt: 'gothic dark-academia bedroom, queen bed, desk, $600 budget',
    profileId: 'gothic' as const,
  },
  {
    prompt: 'coastal beach bedroom with desk and string lights',
    profileId: 'coastal' as const,
  },
  {
    prompt: 'botanical sage dorm with twin bed and study desk',
    profileId: 'nature' as const,
  },
  {
    prompt: 'space astronomy dorm with desk and cozy bedding',
    profileId: 'space' as const,
  },
  {
    prompt: 'japanese woodblock-inspired bedroom, desk, warm lighting',
    profileId: 'japanese' as const,
  },
  {
    prompt: 'warm sunset bedroom with desk and area rug',
    profileId: 'warm' as const,
  },
  {
    prompt: 'minimalist neutral studio with bed and work desk',
    profileId: 'minimalist' as const,
  },
];

/** Rotate which suggestions appear first (deterministic per calendar day). */
export function rotatedThemeSuggestions(count = 4): typeof AGENTIC_THEME_SUGGESTIONS {
  const day = Math.floor(Date.now() / 86_400_000);
  const offset = day % AGENTIC_THEME_SUGGESTIONS.length;
  const rotated = [
    ...AGENTIC_THEME_SUGGESTIONS.slice(offset),
    ...AGENTIC_THEME_SUGGESTIONS.slice(0, offset),
  ];
  return rotated.slice(0, count) as typeof AGENTIC_THEME_SUGGESTIONS;
}

export function posterQueryForProfile(profile: AgenticThemeProfile | null): string {
  if (!profile) return 'minimalist geometric line art wall poster';
  return profile.posterPromptExample;
}
