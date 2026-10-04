import {
  AGENTIC_POSTER_BANK,
  type AgenticPosterBankEntry,
} from './agenticPosterBankData';
import { normalizeSearchText, singularize, tokenize } from './designerSearch';

export interface AgenticPosterMatch {
  kind: string;
  label: string;
  modelUrl: string;
  widthIn: number;
  heightIn: number;
  depthIn: number;
  score: number;
}

const POSTER_QUERY =
  /\b(poster|print|artwork|wall art|canvas|tapestry|decal|picture frame)\b/i;

const QUERY_FILLER = new Set([
  'wall',
  'room',
  'dorm',
  'bedroom',
  'poster',
  'posters',
  'print',
  'prints',
  'art',
  'artwork',
  'decor',
  'decoration',
  'the',
  'and',
  'for',
  'with',
  'set',
  'piece',
]);

export function isPosterDecorQuery(query: string): boolean {
  return POSTER_QUERY.test(query);
}

function contentTokens(query: string, theme?: string): string[] {
  let normalized = normalizeSearchText(`${query} ${theme ?? ''}`);
  return [
    ...new Set(
      tokenize(normalized)
        .map(singularize)
        .filter((t) => t.length >= 3 && !QUERY_FILLER.has(t)),
    ),
  ];
}

function haystack(entry: AgenticPosterBankEntry): string {
  return normalizeSearchText(
    [entry.label, entry.description, ...entry.tags, ...entry.themes].join(' '),
  );
}

function scoreEntry(entry: AgenticPosterBankEntry, query: string, theme?: string): number {
  const tokens = contentTokens(query, theme);
  if (tokens.length === 0) return 0;
  const hay = haystack(entry);
  let score = 0;
  for (const token of tokens) {
    if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay)) {
      score += 20;
    }
  }
  if (theme) {
    const themeNorm = normalizeSearchText(theme);
    if (entry.themes.some((t) => themeNorm.includes(t) || t.includes(themeNorm))) {
      score += 35;
    }
  }
  if (normalizeSearchText(query).includes(normalizeSearchText(entry.label))) {
    score += 50;
  }
  return score;
}

export function resolveAgenticPoster(
  query: string,
  theme?: string,
  minScore = 25,
): AgenticPosterMatch | null {
  if (!isPosterDecorQuery(query)) return null;
  let best: { entry: AgenticPosterBankEntry; score: number } | null = null;
  for (const entry of AGENTIC_POSTER_BANK) {
    const score = scoreEntry(entry, query, theme);
    if (score >= minScore && (!best || score > best.score)) {
      best = { entry, score };
    }
  }
  if (!best) return null;
  const { entry, score } = best;
  return {
    kind: entry.kind,
    label: entry.label,
    modelUrl: entry.modelPath,
    widthIn: entry.widthIn,
    heightIn: entry.heightIn,
    depthIn: entry.depthIn,
    score,
  };
}

export function posterBankEntries(): readonly AgenticPosterBankEntry[] {
  return AGENTIC_POSTER_BANK;
}
