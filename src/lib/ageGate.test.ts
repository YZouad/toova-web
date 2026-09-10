import { describe, expect, it } from 'vitest';
import {
  isAtLeast13,
  isAtLeastAge,
  isMinorUnder18,
  parseBirthMonthYear,
  parseDobInput,
  toIsoDateUtc,
} from './ageGate';
import { needsLegalAcceptance, PRIVACY_VERSION, TERMS_VERSION } from '../legal';

describe('parseDobInput', () => {
  it('parses valid ISO dates', () => {
    const d = parseDobInput('2010-06-15');
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2010);
    expect(d!.getUTCMonth()).toBe(5);
    expect(d!.getUTCDate()).toBe(15);
  });

  it('maps YYYY-MM to the last day of that month', () => {
    const d = parseDobInput('2010-06');
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2010);
    expect(d!.getUTCMonth()).toBe(5);
    expect(d!.getUTCDate()).toBe(30);
  });

  it('rejects invalid calendars', () => {
    expect(parseDobInput('2010-02-30')).toBeNull();
    expect(parseDobInput('2010-13-01')).toBeNull();
    expect(parseDobInput('2010-13')).toBeNull();
    expect(parseDobInput('not-a-date')).toBeNull();
  });
});

describe('parseBirthMonthYear', () => {
  it('uses the last day of the month', () => {
    const d = parseBirthMonthYear('6', '2010');
    expect(d).not.toBeNull();
    expect(toIsoDateUtc(d!)).toBe('2010-06-30');
  });

  it('handles leap February', () => {
    expect(toIsoDateUtc(parseBirthMonthYear('2', '2012')!)).toBe('2012-02-29');
    expect(toIsoDateUtc(parseBirthMonthYear('2', '2011')!)).toBe('2011-02-28');
  });

  it('rejects empty or invalid parts', () => {
    expect(parseBirthMonthYear('', '2010')).toBeNull();
    expect(parseBirthMonthYear('6', '')).toBeNull();
    expect(parseBirthMonthYear('13', '2010')).toBeNull();
  });
});

describe('isAtLeastAge / 13th birthday boundary', () => {
  const today = new Date(Date.UTC(2026, 8, 4)); // 2026-09-04

  it('is true on the exact 13th birthday', () => {
    const dob = new Date(Date.UTC(2013, 8, 4));
    expect(isAtLeast13(dob, today)).toBe(true);
    expect(isAtLeastAge(dob, 13, today)).toBe(true);
  });

  it('is false the day before the 13th birthday', () => {
    const dob = new Date(Date.UTC(2013, 8, 5));
    expect(isAtLeast13(dob, today)).toBe(false);
  });

  it('is true the day after the 13th birthday', () => {
    const dob = new Date(Date.UTC(2013, 8, 3));
    expect(isAtLeast13(dob, today)).toBe(true);
  });

  it('flags 13–17 as minors', () => {
    const fifteen = new Date(Date.UTC(2011, 0, 1));
    expect(isAtLeast13(fifteen, today)).toBe(true);
    expect(isMinorUnder18(fifteen, today)).toBe(true);
  });

  it('does not flag 18+ as minors', () => {
    const adult = new Date(Date.UTC(2008, 8, 4));
    expect(isMinorUnder18(adult, today)).toBe(false);
  });

  it('treats month+year as last day so mid-month 13th birthdays are not admitted early', () => {
    const sept2013 = parseBirthMonthYear('9', '2013')!;
    expect(isAtLeast13(sept2013, today)).toBe(false);
    expect(isAtLeast13(sept2013, new Date(Date.UTC(2026, 8, 30)))).toBe(true);
  });
});

describe('needsLegalAcceptance', () => {
  it('requires acceptance when versions are missing', () => {
    expect(needsLegalAcceptance(null, null)).toBe(true);
    expect(needsLegalAcceptance(undefined, PRIVACY_VERSION)).toBe(true);
  });

  it('requires acceptance when either version is stale', () => {
    expect(needsLegalAcceptance('2020-01-01', PRIVACY_VERSION)).toBe(true);
    expect(needsLegalAcceptance(TERMS_VERSION, '2020-01-01')).toBe(true);
  });

  it('is satisfied when both versions match', () => {
    expect(needsLegalAcceptance(TERMS_VERSION, PRIVACY_VERSION)).toBe(false);
  });
});
