import { NEW_BADGE_DAYS } from './libraryTypes';

/** True when createdAt is within the last NEW_BADGE_DAYS days. */
export function isNewCatalogModel(
  createdAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  const ageMs = nowMs - t;
  if (ageMs < 0) return true;
  return ageMs <= NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;
}

/** Compact placement count for badges (e.g. 1.2k placed). */
export function formatPlacedCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0';
  if (count < 1000) return String(Math.round(count));
  if (count < 10_000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}
