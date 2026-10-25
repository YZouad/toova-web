import { describe, expect, it } from 'vitest';
import {
  activeAgenticSchemeRoles,
  ensureAgenticSchemeColors,
  furnishingsFromColorScheme,
  inferColorSchemeFromTheme,
  parseAgentColorScheme,
  parseColorSchemeInput,
  setAgenticSchemeColor,
} from './agenticColorScheme';
import { AGENTIC_VIBE_FURNISHINGS } from './agenticRoomVibe';

describe('agenticColorScheme', () => {
  it('parses comma-separated hex colors', () => {
    expect(parseColorSchemeInput('#abc, #112233')).toEqual(['#aabbcc', '#112233']);
  });

  it('parses agent JSON array', () => {
    expect(parseAgentColorScheme(['#d8c4ad', '#8a6440'])).toEqual(['#d8c4ad', '#8a6440']);
  });

  it('maps colors to furnishings roles', () => {
    const palette = furnishingsFromColorScheme(
      ['#eeeeee', '#664422', '#334455'],
      AGENTIC_VIBE_FURNISHINGS.warm,
    );
    expect(palette.woodTint).toBe('#664422');
    expect(palette.blanketColor).toBe('#334455');
  });

  it('updates a role in the scheme array', () => {
    const next = setAgenticSchemeColor(['#111111', '#222222', '#333333'], 'wood', '#a98662');
    expect(next[1]).toBe('#a98662');
  });

  it('infers coastal ocean palette from theme', () => {
    const scheme = inferColorSchemeFromTheme('ocean', '');
    expect(scheme?.[0]).toBe('#c8ddd8');
    expect(scheme?.[2]).toBe('#9ab8c8');
  });

  it('shows optional roles when extra colors exist', () => {
    expect(activeAgenticSchemeRoles(['#1', '#2', '#3']).map((r) => r.id)).toEqual([
      'wall',
      'wood',
      'accent',
    ]);
    expect(activeAgenticSchemeRoles(ensureAgenticSchemeColors(['#1', '#2', '#3', '#4'], 4)).length).toBe(
      4,
    );
  });
});
