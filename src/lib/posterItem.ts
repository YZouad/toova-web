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

/** Catalog / gallery row that should only appear via the poster bank, not the main library grid. */
export function isPosterCatalogModel(model: {
  kind: string;
  tags: string[];
}): boolean {
  if (model.kind.startsWith('poster-')) return true;
  return model.tags.includes('poster');
}
