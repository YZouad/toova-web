import type { Item } from '../store';

/** True when an imported placement is a wall poster (curated bank or user upload). */
export function isPosterItem(item: Item | null | undefined): boolean {
  if (!item || item.kind !== 'imported') return false;
  if (item.catalogKind?.startsWith('poster-')) return true;
  return item.catalogTags?.includes('poster') ?? false;
}

export function posterKindForItem(item: Item): string | null {
  if (!isPosterItem(item)) return null;
  return item.catalogKind ?? null;
}
