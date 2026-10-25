/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { hasAnalyticsConsent } from './policy';

describe('hasAnalyticsConsent', () => {
  it('accepts an explicit grant', () => {
    expect(hasAnalyticsConsent({ consent: { analytics: 'granted' }, events: [] }, null)).toBe(true);
  });

  it('rejects missing or denied consent', () => {
    expect(hasAnalyticsConsent({ events: [] }, null)).toBe(false);
    expect(hasAnalyticsConsent({ consent: { analytics: 'denied' } }, null)).toBe(false);
    expect(hasAnalyticsConsent({ consent: 'granted' }, null)).toBe(false);
    expect(hasAnalyticsConsent(null, null)).toBe(false);
    expect(hasAnalyticsConsent([], null)).toBe(false);
  });

  it('treats Global Privacy Control as a refusal', () => {
    expect(hasAnalyticsConsent({ consent: { analytics: 'granted' } }, '1')).toBe(false);
    expect(hasAnalyticsConsent({ consent: { analytics: 'granted' } }, '0')).toBe(true);
  });
});
