import type { Item } from '../../store';
import type { ReviseItemTarget } from './reviseSchema';

export type ResolveItemResult =
  | { ok: true; ids: string[] }
  | { ok: false; reason: 'none' | 'ambiguous' };

export function resolveItemTarget(
  target: ReviseItemTarget,
  items: Record<string, Item>,
  order: string[],
  selectedId: string | null,
): ResolveItemResult {
  if (target.itemId) {
    return items[target.itemId] ? { ok: true, ids: [target.itemId] } : { ok: false, reason: 'none' };
  }

  if (target.useSelection) {
    if (!selectedId || !items[selectedId]) return { ok: false, reason: 'none' };
    return { ok: true, ids: [selectedId] };
  }

  const candidates = order.filter((id) => {
    const it = items[id];
    if (!it || it.kind === 'light') return false;
    if (target.kind && it.kind !== target.kind) return false;
    if (target.labelContains) {
      const label = (it.label ?? '').toLowerCase();
      if (!label.includes(target.labelContains.toLowerCase())) return false;
    }
    return true;
  });

  if (candidates.length === 0) return { ok: false, reason: 'none' };
  if (candidates.length > 1 && !target.kind && !target.labelContains) {
    return { ok: false, reason: 'ambiguous' };
  }
  if (candidates.length > 1 && target.kind && !target.labelContains) {
    return { ok: false, reason: 'ambiguous' };
  }
  return { ok: true, ids: candidates.length === 1 ? [candidates[0]!] : [candidates[0]!] };
}

/** Stricter match for destructive ops — require unique target. */
export function resolveUniqueItemTarget(
  target: ReviseItemTarget,
  items: Record<string, Item>,
  order: string[],
  selectedId: string | null,
): ResolveItemResult {
  if (target.itemId) {
    return items[target.itemId] ? { ok: true, ids: [target.itemId] } : { ok: false, reason: 'none' };
  }
  if (target.useSelection) {
    if (!selectedId || !items[selectedId]) return { ok: false, reason: 'none' };
    return { ok: true, ids: [selectedId] };
  }

  const candidates = order.filter((id) => {
    const it = items[id];
    if (!it || it.kind === 'light') return false;
    if (target.kind && it.kind !== target.kind) return false;
    if (target.labelContains) {
      const label = (it.label ?? '').toLowerCase();
      if (!label.includes(target.labelContains.toLowerCase())) return false;
    }
    return true;
  });

  if (candidates.length === 0) return { ok: false, reason: 'none' };
  if (candidates.length > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: true, ids: [candidates[0]!] };
}
