import type { CatalogCategorySlug } from '../../../lib/catalogCategories';
import type { GallerySort, GallerySource } from '../../../lib/galleryCatalog';
import type { AreaSuggestion } from '../../../lib/roomTagSuggestions';
import type { Item } from '../../../store';
import type { CatalogModel } from '../chromeTypes';
import { formatPriceCents } from '../../../lib/dormChecklist';
import { formatPlacedCount, isNewCatalogModel } from './libraryBadges';

/** Complementary categories for "Pairs well with" cross-sell. */
export const PAIRS_WELL_WITH: Partial<Record<CatalogCategorySlug, CatalogCategorySlug[]>> = {
  desks_workspaces: ['seating', 'lighting'],
  beds: ['storage', 'rugs', 'lighting'],
  seating: ['tables', 'rugs'],
  tables: ['seating', 'lighting'],
  storage: ['beds', 'desks_workspaces'],
  lighting: ['desks_workspaces', 'beds'],
  rugs: ['seating', 'beds'],
  decor_art: ['lighting', 'rugs'],
  plants: ['decor_art', 'lighting'],
  electronics: ['desks_workspaces', 'seating'],
  appliances: ['kitchen', 'storage'],
  kitchen: ['appliances', 'storage'],
  bathroom: ['storage'],
};

export const RAIL_MIN_COUNT = 3;

/** Count placed pieces by catalogKind ?? kind. */
export function inRoomCounts(items: Record<string, Item | undefined>): Map<string, number> {
  const map = new Map<string, number>();
  for (const it of Object.values(items)) {
    if (!it) continue;
    const key = (it.catalogKind?.trim() || it.kind).trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/** 1–3 when sort is hot and index is in the top three; otherwise null. */
export function popularRank(index: number, sort: GallerySort): 1 | 2 | 3 | null {
  if (sort !== 'hot') return null;
  if (index === 0) return 1;
  if (index === 1) return 2;
  if (index === 2) return 3;
  return null;
}

export type BudgetFit =
  | { kind: 'fits'; remainingLabel: string }
  | { kind: 'over'; overLabel: string }
  | { kind: 'unknown' };

export function budgetFit(
  priceCents: number | null | undefined,
  remainingCents: number | null | undefined,
  currency = 'USD',
): BudgetFit {
  if (priceCents == null || !Number.isFinite(priceCents) || remainingCents == null) {
    return { kind: 'unknown' };
  }
  if (priceCents <= remainingCents) {
    const remainingLabel =
      formatPriceCents(remainingCents, currency) ?? `$${(remainingCents / 100).toFixed(0)}`;
    return { kind: 'fits', remainingLabel };
  }
  const over = priceCents - remainingCents;
  const overLabel = formatPriceCents(over, currency) ?? `$${(over / 100).toFixed(0)}`;
  return { kind: 'over', overLabel };
}

export function areaProgress(suggestion: AreaSuggestion | null): {
  label: string;
  present: number;
  total: number;
  complete: boolean;
  missing: AreaSuggestion['missingEssentials'];
} | null {
  if (!suggestion) return null;
  const total =
    suggestion.presentEssentials.length + suggestion.missingEssentials.length;
  if (total === 0) return null;
  const present = suggestion.presentEssentials.length;
  return {
    label: suggestion.label,
    present,
    total,
    complete: suggestion.missingEssentials.length === 0,
    missing: suggestion.missingEssentials,
  };
}

/** Disambiguate duplicate area labels → faceKey → display label ("Bedroom 2"). */
export function disambiguateAreaLabels(
  areas: AreaSuggestion[],
): Map<string, string> {
  const bases = areas.map((a) => a.name?.trim() || a.label);
  const counts = new Map<string, number>();
  for (const b of bases) counts.set(b, (counts.get(b) ?? 0) + 1);
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  areas.forEach((a, i) => {
    const base = bases[i]!;
    if ((counts.get(base) ?? 0) <= 1) {
      out.set(a.faceKey, base);
      return;
    }
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.set(a.faceKey, `${base} ${n}`);
  });
  return out;
}

/**
 * Up to `limit` models complementary to `model`, excluding itself.
 * Uses the seed model's primary category partners in priority order, and only
 * matches candidates on their primary category (`categories[0]`).
 */
export function pairsFor(
  model: CatalogModel,
  models: CatalogModel[],
  limit = 4,
): CatalogModel[] {
  const primary = model.categories[0];
  const partners = primary ? PAIRS_WELL_WITH[primary] : undefined;
  if (!partners?.length) return [];
  const out: CatalogModel[] = [];
  const seen = new Set<string>([model.kind]);
  for (const partner of partners) {
    for (const m of models) {
      if (seen.has(m.kind)) continue;
      if (m.categories[0] !== partner) continue;
      out.push(m);
      seen.add(m.kind);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Models whose primary category is in the area categories, ranked by downloads.
 * Require categories[0] — not any overlap — so picks feel relevant.
 */
export function forYouModels(
  models: CatalogModel[],
  catalogCategories: CatalogCategorySlug[] | undefined,
  limit = 8,
): CatalogModel[] {
  if (!catalogCategories?.length) return [];
  const cats = new Set(catalogCategories);
  return [...models]
    .filter((m) => m.categories[0] != null && cats.has(m.categories[0]))
    .sort((a, b) => b.downloadsCount - a.downloadsCount || b.hotScore - a.hotScore)
    .slice(0, limit);
}

export function newThisWeekModels(models: CatalogModel[], limit = 8): CatalogModel[] {
  return models.filter((m) => isNewCatalogModel(m.createdAt)).slice(0, limit);
}

export function recentModels(
  models: CatalogModel[],
  recentKinds: string[],
  limit = 8,
): CatalogModel[] {
  const byKind = new Map(models.map((m) => [m.kind, m]));
  const out: CatalogModel[] = [];
  for (const k of recentKinds) {
    const m = byKind.get(k);
    if (m) out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}

export function formatModelDims(model: Pick<CatalogModel, 'width_in' | 'depth_in' | 'height_in'>): string {
  const w = Math.round(model.width_in);
  const d = Math.round(model.depth_in);
  const h = Math.round(model.height_in);
  return `${w}″W × ${d}″D × ${h}″H`;
}

/**
 * Build rails with min-count, cross-rail dedupe, and exclusion of the first grid row.
 * Rails are hidden entirely when source is `mine`.
 */
export function prepareShowroomRails(input: {
  models: CatalogModel[];
  areaCategories?: CatalogCategorySlug[];
  recentKinds: string[];
  source: GallerySource;
  /** Kinds shown in the first grid row (typically first 4). */
  excludeKinds?: string[];
  minCount?: number;
}): {
  forYou: CatalogModel[];
  newWeek: CatalogModel[];
  recent: CatalogModel[];
} {
  const min = input.minCount ?? RAIL_MIN_COUNT;
  if (input.source === 'mine') {
    return { forYou: [], newWeek: [], recent: [] };
  }
  const exclude = new Set(input.excludeKinds ?? []);
  const take = (list: CatalogModel[]) =>
    list.filter((m) => !exclude.has(m.kind)).slice(0, 8);

  let forYou = take(forYouModels(input.models, input.areaCategories, 12));
  for (const m of forYou) exclude.add(m.kind);

  let newWeek = take(newThisWeekModels(input.models, 12));
  for (const m of newWeek) exclude.add(m.kind);

  let recent = take(recentModels(input.models, input.recentKinds, 12));

  if (forYou.length < min) forYou = [];
  if (newWeek.length < min) newWeek = [];
  if (recent.length < min) recent = [];

  return { forYou, newWeek, recent };
}

/** Visible badges for a card — at most 1 (rank > in-room > new > placed≥10). */
export function cardBadges(input: {
  rank: 1 | 2 | 3 | null;
  isNew: boolean;
  placedCount: number;
  inRoom: number;
}): { visible: { key: string; label: string; className?: string }[]; title: string } {
  const all: { key: string; label: string; className?: string }[] = [];
  if (input.rank) {
    all.push({ key: 'rank', label: `#${input.rank} Popular`, className: 'dgl-badge--rank' });
  }
  if (input.inRoom > 0) {
    all.push({
      key: 'owned',
      label: input.inRoom > 1 ? `In your room ×${input.inRoom}` : 'In your room',
      className: 'dgl-badge--owned',
    });
  }
  if (input.isNew) {
    all.push({ key: 'new', label: 'New', className: 'dgl-badge--new' });
  }
  if (input.placedCount >= 10) {
    all.push({
      key: 'placed',
      label: `${formatPlacedCount(input.placedCount)} placed`,
    });
  }
  return {
    visible: all.slice(0, 1),
    title: all.map((b) => b.label).join(' · '),
  };
}

/** Drop near-duplicate community rows (same creator + label + dims). */
export function dedupeCommunityModels(models: CatalogModel[]): CatalogModel[] {
  const seen = new Set<string>();
  const out: CatalogModel[] = [];
  for (const m of models) {
    if (m.isBuiltin) {
      out.push(m);
      continue;
    }
    const key = [
      m.userId ?? '',
      m.label.trim().toLowerCase(),
      Math.round(m.width_in),
      Math.round(m.height_in),
      Math.round(m.depth_in),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}
