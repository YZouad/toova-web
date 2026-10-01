import { ft, inches, ROOM } from '../units';
import { parseVibeToken, type AgenticVibeId } from './agenticRoomVibe';

export type { AgenticVibeId } from './agenticRoomVibe';

export interface AgenticItemAsk {
  /** Raw phrase from the prompt (“nightstand”, “desk lamp”). */
  query: string;
  qty: number;
  /** Rough USD-cent estimate for this line (qty included). From Cursor shopping list. */
  estimatedCents?: number;
}

export interface AgenticRoomRequest {
  /** Interior width in inches (X). */
  widthIn: number;
  /** Interior depth in inches (Y). */
  depthIn: number;
  /** Optional wall height; default ROOM.height (96). */
  heightIn?: number;
  items: AgenticItemAsk[];
  /** Soft budget in USD cents. Omit if the user didn't name a price. */
  budgetCents?: number;
  vibe?: AgenticVibeId;
}

export interface AgenticParseSuccess {
  ok: true;
  request: AgenticRoomRequest;
  warnings: string[];
}

export interface AgenticParseFailure {
  ok: false;
  error: string;
}

export type AgenticParseResult = AgenticParseSuccess | AgenticParseFailure;

const DEFAULT_WIDTH_IN = inches(10);
const DEFAULT_DEPTH_IN = inches(12);

/** Longest-first phrases for item extraction (multi-word before single-word). */
const ITEM_PHRASES: readonly string[] = [
  'string lights',
  'fairy lights',
  'desk lamp',
  'floor lamp',
  'table lamp',
  'night stand',
  'nightstand',
  'bookshelf',
  'bookshelves',
  'whiteboard',
  'dresser',
  'wardrobe',
  'nightstand',
  'bookshelf',
  'mattress',
  'bedding',
  'comforter',
  'pillow',
  'mirror',
  'storage',
  'seating',
  'lighting',
  'garland',
  'blanket',
  'sheets',
  'closet',
  'organizer',
  'shelf',
  'shelves',
  'chair',
  'chairs',
  'couch',
  'sofa',
  'desk',
  'desks',
  'table',
  'lamp',
  'lamps',
  'light',
  'lights',
  'rug',
  'bed',
  'beds',
  'led',
  'leaves',
].sort((a, b) => b.length - a.length);

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'with',
  'and',
  'or',
  'for',
  'my',
  'room',
  'that',
  'is',
  'are',
  'has',
  'have',
  'need',
  'needs',
  'want',
  'wants',
  'some',
  'plus',
  'also',
  'include',
  'including',
  'around',
  'about',
  'under',
  'over',
  'vibe',
  'style',
  'look',
  'feeling',
  'price',
  'point',
  'budget',
]);

function normalizePrompt(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDimensionPair(text: string): {
  widthIn: number;
  depthIn: number;
  rest: string;
} | null {
  const dimRe =
    /(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)?\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot|in|inch|inches|")?/i;
  const m = dimRe.exec(text);
  if (!m) return null;

  let w = Number(m[1]);
  let d = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(d) || w <= 0 || d <= 0) return null;

  const unitHint = m[0].toLowerCase();
  const usesInches = /in|inch|"/.test(unitHint);
  const usesFeet = /'|ft|feet|foot/.test(unitHint);
  if (!usesInches && !usesFeet) {
    // Bare numbers under ~30 treated as feet (typical room sizes).
    if (w <= 30 && d <= 30) {
      w *= ft;
      d *= ft;
    }
  } else if (usesFeet && !usesInches) {
    w *= ft;
    d *= ft;
  }

  const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
  return { widthIn: w, depthIn: d, rest };
}

function parseBudgetCents(text: string): { budgetCents: number; rest: string } | null {
  const underRe = /(?:under|below|max|budget|around|about)\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:k|grand)?/i;
  const dollarRe = /\$\s*(\d+(?:\.\d+)?)\s*(?:k|grand)?/i;

  let m = underRe.exec(text);
  if (m) {
    const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.trim();
    return { budgetCents: dollarsToCents(m[1]!, m[0]), rest };
  }

  m = dollarRe.exec(text);
  if (m) {
    const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.trim();
    return { budgetCents: dollarsToCents(m[1]!, m[0]), rest };
  }

  return null;
}

function dollarsToCents(amount: string, context: string): number {
  let n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (/\bk\b|grand/i.test(context)) n *= 1000;
  return Math.round(n * 100);
}

function parseVibe(text: string): { vibe: AgenticVibeId | undefined; rest: string; unknownVibe?: string } {
  const vibeRe = /\b(\w+)\s+vibe\b/i;
  const m = vibeRe.exec(text);
  if (m) {
    const parsed = parseVibeToken(m[1]!);
    const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.trim();
    if (parsed) return { vibe: parsed, rest };
    return { vibe: 'neutral', rest, unknownVibe: m[1]! };
  }

  for (const word of text.split(/\s+/)) {
    const parsed = parseVibeToken(word.replace(/[^a-z]/gi, ''));
    if (parsed) {
      const rest = text.replace(new RegExp(`\\b${word}\\b`, 'i'), '').replace(/\s+/g, ' ').trim();
      return { vibe: parsed, rest };
    }
  }

  return { vibe: undefined, rest: text };
}

function extractItems(text: string): AgenticItemAsk[] {
  let work = text.toLowerCase();
  work = work.replace(/\band\b/g, ',');
  work = work.replace(/[,;]+/g, ',');

  const found: AgenticItemAsk[] = [];
  const qtyRe = /\b(\d+)\s+x?\s*/g;

  for (const phrase of ITEM_PHRASES) {
    const phraseRe = new RegExp(`\\b(\\d+)\\s+(?:x\\s*)?(${phrase.replace(/\s+/g, '\\s+')})s?\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = phraseRe.exec(work)) !== null) {
      found.push({ query: phrase, qty: Math.max(1, Number(m[1])) });
      work = `${work.slice(0, m.index)} ${work.slice(m.index + m[0].length)}`;
      phraseRe.lastIndex = 0;
    }

    const bareRe = new RegExp(`\\b(${phrase.replace(/\s+/g, '\\s+')})s?\\b`, 'gi');
    while ((m = bareRe.exec(work)) !== null) {
      const before = work.slice(Math.max(0, m.index - 8), m.index);
      const qtyMatch = /(\d+)\s+x?\s*$/.exec(before);
      const qty = qtyMatch ? Math.max(1, Number(qtyMatch[1])) : 1;
      found.push({ query: phrase, qty });
      work = `${work.slice(0, m.index)} ${work.slice(m.index + m[0].length)}`;
      bareRe.lastIndex = 0;
    }
  }

  // Remaining comma-separated tokens
  for (const token of work.split(',')) {
    const cleaned = token
      .replace(qtyRe, '')
      .replace(/[^a-z0-9\s-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) continue;
    for (const word of cleaned.split(/\s+/)) {
      if (STOP_WORDS.has(word) || word.length < 2) continue;
      if (ITEM_PHRASES.includes(word)) continue;
      if (found.some((f) => f.query === word)) continue;
      found.push({ query: word, qty: 1 });
    }
  }

  // Merge duplicates (normalize simple plurals: lamps → lamp)
  const merged = new Map<string, number>();
  for (const item of found) {
    const key = item.query.replace(/s$/, '');
    merged.set(key, (merged.get(key) ?? 0) + item.qty);
  }
  return [...merged.entries()].map(([query, qty]) => ({ query, qty }));
}

export function parseAgenticRoomPrompt(raw: string): AgenticParseResult {
  const text = normalizePrompt(raw);
  if (!text) {
    return { ok: false, error: 'Describe your room size and the furniture you want.' };
  }

  const warnings: string[] = [];
  let work = text;

  let widthIn = DEFAULT_WIDTH_IN;
  let depthIn = DEFAULT_DEPTH_IN;
  let usedDefaultSize = true;

  const dims = parseDimensionPair(work);
  if (dims) {
    widthIn = dims.widthIn;
    depthIn = dims.depthIn;
    work = dims.rest;
    usedDefaultSize = false;
  }

  let budgetCents: number | undefined;
  const budget = parseBudgetCents(work);
  if (budget) {
    budgetCents = budget.budgetCents;
    work = budget.rest;
  }

  let vibe: AgenticVibeId | undefined;
  const vibeParsed = parseVibe(work);
  vibe = vibeParsed.vibe;
  work = vibeParsed.rest;
  if (vibeParsed.unknownVibe) {
    warnings.push(`Unrecognized vibe "${vibeParsed.unknownVibe}" — using neutral.`);
  }

  const items = extractItems(work);
  if (items.length === 0) {
    return {
      ok: false,
      error: 'Name at least one piece of furniture (e.g. bed, desk, lamp).',
    };
  }

  if (usedDefaultSize) {
    warnings.push('Room size not detected — using 10′ × 12′.');
  }

  const minSide = 12; // MIN_WALL_LENGTH * 2
  if (widthIn < minSide || depthIn < minSide) {
    return { ok: false, error: 'Room dimensions are too small. Try at least 6′ × 6′.' };
  }

  return {
    ok: true,
    request: {
      widthIn,
      depthIn,
      heightIn: ROOM.height,
      items,
      budgetCents,
      vibe,
    },
    warnings,
  };
}
