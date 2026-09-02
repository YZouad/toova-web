import type { ChecklistLineModel } from './checklistLines';

export interface ChecklistProgressCounts {
  total: number;
  placed: number;
  todo: number;
  resolved: number;
  progressPct: number;
}

/** Per-category counts (one leaf line = one checklist slot, not per product option). */
export function checklistProgressCounts(lines: ChecklistLineModel[]): ChecklistProgressCounts {
  const total = lines.length;
  const placed = lines.filter((l) => l.status === 'placed').length;
  const todo = lines.filter((l) => l.status === 'open').length;
  const resolved = lines.filter((l) => l.status === 'have' || l.status === 'skip').length;
  const progressPct = total === 0 ? 0 : Math.round((placed / total) * 100);
  return { total, placed, todo, resolved, progressPct };
}
