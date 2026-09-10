/** Age eligibility helpers (client-side mirror of public.is_at_least_age). */

/** Last calendar day of `month` (1–12) in UTC. Used when we only collect month + year. */
export function lastDayOfMonthUtc(year: number, month: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (year < 1900 || year > 2100 || month < 1 || month > 12) return null;
  const dt = new Date(Date.UTC(year, month, 0));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1) return null;
  return dt;
}

export function toIsoDateUtc(dob: Date): string {
  const y = dob.getUTCFullYear();
  const m = String(dob.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dob.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseBirthMonthYear(month: string, year: string): Date | null {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || !Number.isInteger(y)) return null;
  return lastDayOfMonthUtc(y, m);
}

export function dobIsoFromMonthYear(month: string, year: string): string | null {
  const d = parseBirthMonthYear(month, year);
  return d ? toIsoDateUtc(d) : null;
}

/**
 * Parses a stored/stashed value.
 * `YYYY-MM` (month + year only) maps to the last day of that month so the 13+
 * check does not admit someone who might still be 12 later in the month.
 * `YYYY-MM-DD` is accepted for older pending-acceptance payloads.
 */
export function parseDobInput(value: string): Date | null {
  const trimmed = value.trim();
  const ym = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    return lastDayOfMonthUtc(Number(ym[1]), Number(ym[2]));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y
    || dt.getUTCMonth() !== m - 1
    || dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

/** True if DOB is on or before the calendar day the person turned `age`. */
export function isAtLeastAge(dob: Date, age: number, today: Date = new Date()): boolean {
  if (!Number.isFinite(age) || age <= 0) return false;
  const y = today.getUTCFullYear() - age;
  const m = today.getUTCMonth();
  const d = today.getUTCDate();
  const cutoff = Date.UTC(y, m, d);
  const dobUtc = Date.UTC(dob.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate());
  return dobUtc <= cutoff;
}

export function isAtLeast13(dob: Date, today?: Date): boolean {
  return isAtLeastAge(dob, 13, today);
}

export function isMinorUnder18(dob: Date, today?: Date): boolean {
  return !isAtLeastAge(dob, 18, today);
}
