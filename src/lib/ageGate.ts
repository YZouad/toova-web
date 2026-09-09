/** Age eligibility helpers (client-side mirror of public.is_at_least_age). */

export function parseDobInput(value: string): Date | null {
  const trimmed = value.trim();
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
