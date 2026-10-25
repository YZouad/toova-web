/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  AUTO_QUARANTINE_REASONS,
  autoQuarantineSkipNote,
  shouldAutoQuarantine,
} from './quarantinePolicy.ts';

describe('shouldAutoQuarantine', () => {
  it('allows verified signed-in reporters for CSAM / sexual content', () => {
    expect(
      shouldAutoQuarantine('csam', { id: 'user-1', emailConfirmed: true }),
    ).toBe(true);
    expect(
      shouldAutoQuarantine('sexual_content', { id: 'user-1', emailConfirmed: true }),
    ).toBe(true);
  });

  it('blocks anonymous reporters', () => {
    expect(
      shouldAutoQuarantine('csam', { id: null, emailConfirmed: false }),
    ).toBe(false);
    expect(autoQuarantineSkipNote({ id: null, emailConfirmed: false })).toBe(
      'anonymous report, queued for review',
    );
  });

  it('blocks unverified email reporters', () => {
    expect(
      shouldAutoQuarantine('csam', { id: 'user-1', emailConfirmed: false }),
    ).toBe(false);
    expect(autoQuarantineSkipNote({ id: 'user-1', emailConfirmed: false })).toBe(
      'unverified reporter, queued for review',
    );
  });

  it('ignores non-auto-quarantine reasons', () => {
    expect(
      shouldAutoQuarantine('spam', { id: 'user-1', emailConfirmed: true }),
    ).toBe(false);
    expect(AUTO_QUARANTINE_REASONS.has('spam')).toBe(false);
  });
});
