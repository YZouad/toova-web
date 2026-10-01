import { describe, expect, it } from 'vitest';
import { parseAgenticRoomPrompt } from './agenticRoomPrompt';
import { inches } from '../units';

describe('parseAgenticRoomPrompt', () => {
  it('parses full dorm-style prompt', () => {
    const result = parseAgenticRoomPrompt('10 by 12, bed and desk, under $400, sage vibe');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.widthIn).toBe(inches(10));
    expect(result.request.depthIn).toBe(inches(12));
    expect(result.request.budgetCents).toBe(40000);
    expect(result.request.vibe).toBe('sage');
    expect(result.request.items.map((i) => i.query)).toEqual(expect.arrayContaining(['bed', 'desk']));
  });

  it('defaults room size when missing', () => {
    const result = parseAgenticRoomPrompt('bed, desk, lamp');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.includes('10'))).toBe(true);
    expect(result.request.items.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps desk lamp as one phrase', () => {
    const result = parseAgenticRoomPrompt('12 x 10 desk lamp and bed');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.items.some((i) => i.query === 'desk lamp')).toBe(true);
    expect(result.request.items.some((i) => i.query === 'lamp')).toBe(false);
  });

  it('parses quantity prefix', () => {
    const result = parseAgenticRoomPrompt('10 by 12, 2 lamps');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lamp = result.request.items.find((i) => i.query === 'lamp');
    expect(lamp?.qty).toBe(2);
  });

  it('fails when no furniture named', () => {
    const result = parseAgenticRoomPrompt('10 by 12, sage vibe');
    expect(result.ok).toBe(false);
  });

  it('maps cozy to warm vibe', () => {
    const result = parseAgenticRoomPrompt('10x10 bed cozy vibe');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.vibe).toBe('warm');
  });
});
