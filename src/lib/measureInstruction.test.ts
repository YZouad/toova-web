import { describe, expect, it } from 'vitest';
import { measureBannerHint } from './measureInstruction';

describe('measureBannerHint', () => {
  it('prompts for first click when idle', () => {
    expect(
      measureBannerHint({ hasPending: false, acceptField: null, count: 0 }),
    ).toBe('Click two points on any surface · Hold Alt to suspend snap');
  });

  it('prompts for second click while pending', () => {
    expect(
      measureBannerHint({ hasPending: true, acceptField: null, count: 0 }),
    ).toBe('Click the second point to finish this tape');
  });

  it('includes field guidance for import measure', () => {
    expect(
      measureBannerHint({ hasPending: false, acceptField: 'depth', count: 0 }),
    ).toBe(
      'Click two points · Measuring Depth · Pick points front-to-back',
    );
  });

  it('offers another tape after one is committed', () => {
    expect(
      measureBannerHint({ hasPending: false, acceptField: null, count: 1 }),
    ).toBe('Click two points for another tape · Esc exits');
  });
});
