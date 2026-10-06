import { describe, expect, it } from 'vitest';
import {
  AGENTIC_THEME_SUGGESTIONS,
  resolveAgenticThemeProfile,
  rotatedThemeSuggestions,
} from './agenticThemeProfile';
import { appearanceForAgenticTheme } from './agenticRoomVibe';

describe('resolveAgenticThemeProfile', () => {
  it.each([
    ['minecraft dorm', 'blockGaming'],
    ['voxel gaming bedroom', 'blockGaming'],
    ['pixel sandbox room', 'blockGaming'],
    ['gothic dark academia bedroom', 'gothic'],
    ['coastal beach bedroom', 'coastal'],
    ['botanical sage dorm', 'nature'],
    ['space astronomy room', 'space'],
    ['japanese woodblock bedroom', 'japanese'],
    ['warm sunset bedroom', 'warm'],
    ['minimalist neutral studio', 'minimalist'],
  ] as const)('maps "%s" to %s', (prompt, expectedId) => {
    expect(resolveAgenticThemeProfile(null, prompt)?.id).toBe(expectedId);
  });

  it('does not map craft room to block gaming', () => {
    expect(resolveAgenticThemeProfile(null, 'craft room with sewing table')?.id).not.toBe(
      'blockGaming',
    );
  });

  it('falls back to minimalist for unthemed bedroom', () => {
    expect(resolveAgenticThemeProfile(null, '10x12 bedroom with a queen bed')?.id).toBe(
      'minimalist',
    );
  });

  it('uses warm finishes when the prompt asks for wood or brown', () => {
    expect(resolveAgenticThemeProfile(null, 'wooden brown home office')?.id).toBe('warm');
  });

  it('explicit theme overrides prompt inference', () => {
    expect(resolveAgenticThemeProfile('coastal', 'gothic cathedral bedroom')?.id).toBe('coastal');
  });
});

describe('theme appearance', () => {
  it('block gaming uses grass-green walls', () => {
    const appearance = appearanceForAgenticTheme('minecraft', 'minecraft dorm');
    expect(appearance?.wallColor?.toLowerCase()).toBe('#5c7f3a');
    expect(appearance?.floorPreset).toBe('darkOak');
  });

  it('gothic uses charcoal walls', () => {
    const appearance = appearanceForAgenticTheme('gothic', 'gothic bedroom');
    expect(appearance?.wallColor?.toLowerCase()).toBe('#2a2a2e');
  });
});

describe('rotatedThemeSuggestions', () => {
  it('returns four suggestions by default', () => {
    expect(rotatedThemeSuggestions(4)).toHaveLength(4);
  });

  it('each suggestion resolves to its profile', () => {
    for (const suggestion of AGENTIC_THEME_SUGGESTIONS) {
      expect(resolveAgenticThemeProfile(null, suggestion.prompt)?.id).toBe(suggestion.profileId);
    }
  });
});
