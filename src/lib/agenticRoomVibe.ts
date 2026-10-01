import type { RoomAppearance } from './roomAppearance';
import { DEFAULT_APPEARANCE } from './roomAppearance';

export type AgenticVibeId = 'warm' | 'neutral' | 'studio' | 'moody' | 'sage';

/** Maps agentic vibe ids to wall + floor presets (see docs/agentic-room-generation-spec.md). */
export const AGENTIC_VIBE_APPEARANCE: Record<
  AgenticVibeId,
  Pick<RoomAppearance, 'wallColor' | 'floorPreset'>
> = {
  warm: { wallColor: '#d8d0c2', floorPreset: 'lightOak' },
  neutral: { wallColor: '#cfc7b8', floorPreset: 'lightOak' },
  studio: { wallColor: '#f2efe8', floorPreset: 'concrete' },
  moody: { wallColor: '#3a3a3a', floorPreset: 'lightOak' },
  sage: { wallColor: '#6b7f6a', floorPreset: 'lightOak' },
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

export function appearanceForAgenticVibe(vibe?: AgenticVibeId): RoomAppearance {
  const partial = vibe ? AGENTIC_VIBE_APPEARANCE[vibe] : null;
  return {
    ...DEFAULT_APPEARANCE,
    ...(partial ?? AGENTIC_VIBE_APPEARANCE.neutral),
  };
}
