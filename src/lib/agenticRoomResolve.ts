import { FURNITURE, type FurnitureKind, type GalleryFurnitureKind } from '../furniture/registry';
import type { CuratedProduct } from './dormChecklist';
import type { AgenticItemAsk, AgenticRoomRequest } from './agenticRoomPrompt';
import { normalizeSearchText, scoreCandidate, tokenize } from './designerSearch';
import type { ScoredCandidate } from '../ui/designer/commandSearchTypes';

/** Minimum score to accept a catalog product match (palette boosts disabled). */
export const AGENTIC_MATCH_MIN_SCORE = 45;

const BUILTIN_KINDS = Object.keys(FURNITURE) as GalleryFurnitureKind[];

const QUERY_TO_BUILTIN: Record<string, GalleryFurnitureKind> = {
  bed: 'bed',
  beds: 'bed',
  mattress: 'bed',
  bedding: 'bed',
  desk: 'desk',
  desks: 'desk',
  table: 'desk',
  study: 'desk',
  chair: 'chair',
  chairs: 'chair',
  couch: 'chair',
  sofa: 'chair',
  seating: 'chair',
  lamp: 'lamp',
  lamps: 'lamp',
  light: 'lamp',
  lights: 'lamp',
  lighting: 'lamp',
  dresser: 'dresser',
  wardrobe: 'wardrobe',
  bookshelf: 'bookshelf',
  shelf: 'shelf',
  shelves: 'shelf',
  storage: 'dresser',
  nightstand: 'nightstand',
  'night stand': 'nightstand',
};

export interface ResolvedAgenticItem {
  query: string;
  qty: number;
  product: CuratedProduct | null;
  alternates: CuratedProduct[];
  score: number;
  builtinKind: GalleryFurnitureKind | null;
  warnings: string[];
}

export interface AgenticResolveResult {
  items: ResolvedAgenticItem[];
  overBudget: boolean;
  totalCents: number;
}

function productCandidates(products: CuratedProduct[]): ScoredCandidate[] {
  return products
    .filter((p) => p.published)
    .map((p) => ({
      id: p.id,
      label: p.name,
      section: 'add' as const,
      source: 'checklist' as const,
      searchable: [
        p.name,
        p.description,
        p.brand ?? '',
        p.dimensionsText ?? '',
        ...(p.featureBullets ?? []),
        p.placeBuiltinKind ?? '',
        p.placeCatalogKind ?? '',
      ].filter(Boolean),
    }));
}

function rankProductsForQuery(
  query: string,
  products: CuratedProduct[],
): Array<{ product: CuratedProduct; score: number }> {
  const candidates = productCandidates(products);
  const scored = candidates
    .map((c) => {
      const product = products.find((p) => p.id === c.id);
      if (!product) return null;
      const score = scoreCandidate(c, query);
      return { product, score };
    })
    .filter((x): x is { product: CuratedProduct; score: number } => x != null && x.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));

  return scored;
}

function resolveBuiltinKind(query: string): GalleryFurnitureKind | null {
  const n = normalizeSearchText(query);
  if (QUERY_TO_BUILTIN[n]) return QUERY_TO_BUILTIN[n]!;

  let best: { kind: GalleryFurnitureKind; score: number } | null = null;
  for (const kind of BUILTIN_KINDS) {
    const def = FURNITURE[kind];
    const candidate: ScoredCandidate = {
      id: kind,
      label: def.label,
      kind,
      section: 'add',
      source: 'toova',
      searchable: [def.label, kind, ...(def.categories ?? [])],
    };
    const score = scoreCandidate(candidate, query);
    if (score >= AGENTIC_MATCH_MIN_SCORE && (!best || score > best.score)) {
      best = { kind, score };
    }
  }
  return best?.kind ?? null;
}

function priceForItem(item: ResolvedAgenticItem): number {
  if (!item.product?.priceCents) return 0;
  return item.product.priceCents * item.qty;
}

function resolveOneItem(query: string, qty: number, products: CuratedProduct[]): ResolvedAgenticItem {
  const ranked = rankProductsForQuery(query, products);
  const top = ranked[0];
  const warnings: string[] = [];

  if (top && top.score >= AGENTIC_MATCH_MIN_SCORE) {
    return {
      query,
      qty,
      product: top.product,
      alternates: ranked.slice(1, 4).map((r) => r.product),
      score: top.score,
      builtinKind: null,
      warnings,
    };
  }

  const builtinKind = resolveBuiltinKind(query);
  if (builtinKind) {
    warnings.push(`No catalog match for "${query}" — using ${FURNITURE[builtinKind].label} placeholder.`);
    return {
      query,
      qty,
      product: null,
      alternates: ranked.slice(0, 3).map((r) => r.product),
      score: top?.score ?? 0,
      builtinKind,
      warnings,
    };
  }

  warnings.push(`Could not match "${query}" to a product or furniture type.`);
  return {
    query,
    qty,
    product: null,
    alternates: ranked.slice(0, 3).map((r) => r.product),
    score: top?.score ?? 0,
    builtinKind: null,
    warnings,
  };
}

/** Prefer cheaper alternates when over budget (single pass, greedy). */
export function optimizeForBudget(
  items: ResolvedAgenticItem[],
  budgetCents: number | undefined,
  allProducts: CuratedProduct[],
): ResolvedAgenticItem[] {
  if (budgetCents == null) return items;

  let total = items.reduce((sum, it) => sum + priceForItem(it), 0);
  if (total <= budgetCents) return items;

  const next = items.map((item) => ({ ...item, alternates: [...item.alternates] }));
  for (const item of next) {
    if (!item.product) continue;
    const ranked = rankProductsForQuery(item.query, allProducts).filter(
      (r) => r.score >= AGENTIC_MATCH_MIN_SCORE,
    );
    const candidates = [
      item.product,
      ...item.alternates,
      ...ranked.slice(0, 6).map((r) => r.product),
    ];
    const unique = new Map<string, CuratedProduct>();
    for (const p of candidates) unique.set(p.id, p);
    const sorted = [...unique.values()].sort(
      (a, b) => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity),
    );
    for (const candidate of sorted) {
      const oldPrice = item.product.priceCents ?? 0;
      const newPrice = candidate.priceCents ?? 0;
      if (candidate.id === item.product.id) continue;
      if (newPrice >= oldPrice) continue;
      total = total - oldPrice * item.qty + newPrice * item.qty;
      const prevPrimary = item.product;
      item.product = candidate;
      item.alternates = sorted.filter((p) => p.id !== candidate.id).slice(0, 3);
      if (total <= budgetCents) return next;
    }
  }
  return next;
}

export function resolveAgenticItems(
  request: AgenticRoomRequest,
  products: CuratedProduct[],
): AgenticResolveResult {
  let items = request.items.map((ask: AgenticItemAsk) =>
    resolveOneItem(ask.query, ask.qty, products),
  );
  items = optimizeForBudget(items, request.budgetCents, products);

  const totalCents = items.reduce((sum, it) => sum + priceForItem(it), 0);
  const overBudget =
    request.budgetCents != null && totalCents > request.budgetCents && totalCents > 0;

  return { items, overBudget, totalCents };
}

export function flattenCatalogProducts(
  categories: Array<{ products: CuratedProduct[] }>,
): CuratedProduct[] {
  const map = new Map<string, CuratedProduct>();
  for (const cat of categories) {
    for (const p of cat.products) {
      if (p.published) map.set(p.id, p);
    }
  }
  return [...map.values()];
}

/** Format unit price for display. */
export function formatAgenticPrice(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function itemQueryTokens(query: string): string[] {
  return tokenize(query);
}
