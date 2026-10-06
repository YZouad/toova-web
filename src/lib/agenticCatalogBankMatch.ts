import type { CuratedProduct } from './dormChecklist';
import { normalizeSearchText } from './designerSearch';

/** In-room stand-in kinds matched from shopping-list nouns (adjectives stay on the query). */
export type CatalogBankKind = 'rug' | 'string-lights' | 'leaves' | 'led-strip' | 'fridge';

const RUG_RE = /\b(area\s+)?rugs?\b|\bcarpets?\b/i;
const STRING_LIGHTS_RE = /\b(string\s+lights?|fairy\s+lights?|fairly\s+lights?)\b/i;
const LEAVES_RE = /\b(hanging\s+)?(leaves|ivy|garland|vines?)\b/i;
const LED_STRIP_RE = /\bled\s+strips?\b/i;
const FRIDGE_RE = /\b(mini\s+)?fridges?\b|\brefrigerators?\b/i;

/** Detect which catalog-bank stand-in a shopping query should use. */
export function detectCatalogBankKind(
  query: string,
  _userPrompt?: string,
): CatalogBankKind | null {
  const n = normalizeSearchText(query);
  if (LED_STRIP_RE.test(n)) return 'led-strip';
  if (STRING_LIGHTS_RE.test(n)) return 'string-lights';
  if (LEAVES_RE.test(n) && !/\b(poster|wall art|print)\b/.test(n)) return 'leaves';
  if (FRIDGE_RE.test(n)) return 'fridge';
  if (RUG_RE.test(n) && !/\b(bath|shower|doormat|welcome|yoga)\b/.test(n)) return 'rug';
  return null;
}

/** True when the query names string/fairy/LED-strip decor (not a desk or floor lamp). */
export function isHangingDecorQuery(query: string): boolean {
  const kind = detectCatalogBankKind(query);
  return kind === 'string-lights' || kind === 'leaves' || kind === 'led-strip';
}

/** True when the query names a rug or carpet. */
export function isRugQuery(query: string): boolean {
  return detectCatalogBankKind(query) === 'rug';
}

function fridgeSlug(userPrompt?: string): string {
  if (/\b(uchicago|u\s*chicago)\b/i.test(userPrompt ?? '')) return 'uchicago-mini-fridge';
  return 'fridge';
}

function slugForBankKind(kind: CatalogBankKind, userPrompt?: string): string {
  switch (kind) {
    case 'rug':
      return 'rug';
    case 'string-lights':
      return 'fairlylights1';
    case 'leaves':
      return 'leaves';
    case 'led-strip':
      return 'led1';
    case 'fridge':
      return fridgeSlug(userPrompt);
  }
}

/** Map a shopping query to its curated checklist product (kind-first, ignores adjectives). */
export function resolveCatalogBankProduct(
  query: string,
  products: CuratedProduct[],
  userPrompt?: string,
): CuratedProduct | null {
  const kind = detectCatalogBankKind(query, userPrompt);
  if (!kind) return null;
  const slug = slugForBankKind(kind, userPrompt);
  return products.find((p) => p.published && p.slug === slug) ?? null;
}
