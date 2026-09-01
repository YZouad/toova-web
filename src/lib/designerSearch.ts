/**
 * Pure designer command-palette search helpers.
 * No network / React — unit-testable ranking, aliases, and intent.
 */

import type {
  DesignerSearchIntent,
  RankOptions,
  ScoredCandidate,
  SearchScope,
  SearchSection,
} from '../ui/designer/commandSearchTypes';

/**
 * Built-in / tool / category aliases (query term → related terms).
 * Multi-word aliases must stay whole phrases — never explode into tokens
 * (e.g. lamp → "floor lamp" must not inject bare "floor" into scoring).
 */
export const SEARCH_ALIASES: Record<string, string[]> = {
  lamp: ['lighting', 'desk lamp', 'floor lamp', 'lamps', 'string lights'],
  light: ['lamp', 'lighting', 'lights', 'string lights'],
  lights: ['lamp', 'light', 'lighting', 'string lights', 'lamps'],
  lighting: ['lamp', 'light', 'lights'],
  lamps: ['lamp', 'light', 'lighting'],
  couch: ['chair', 'seating', 'sofa'],
  sofa: ['chair', 'seating', 'couch'],
  seating: ['chair', 'couch', 'sofa'],
  storage: ['dresser', 'bookshelf', 'wardrobe', 'shelf', 'nightstand'],
  bed: ['twin', 'bedding', 'mattress'],
  desk: ['workspace', 'table', 'study'],
  rug: ['carpet', 'mat'],
  mirror: ['looking glass'],
  whiteboard: ['board', 'dry erase'],
  string: ['fairy', 'garland', 'strand', 'string lights', 'leds'],
  fairy: ['string lights', 'garland'],
  garland: ['leaves', 'string lights', 'hanging'],
  leaves: ['garland', 'hanging', 'vines'],
  paint: ['wall paint', 'walls', 'color'],
  wall: ['wall paint', 'walls', 'paint'],
  walls: ['wall paint', 'paint', 'color'],
  camera: ['view', 'angle', 'orbit'],
  view: ['camera', 'room view', 'desk view', 'top view'],
};

const SINGULAR_MAP: Record<string, string> = {
  lamps: 'lamp',
  lights: 'light',
  chairs: 'chair',
  desks: 'desk',
  beds: 'bed',
  shelves: 'shelf',
  rugs: 'rug',
  mirrors: 'mirror',
  walls: 'wall',
  colors: 'color',
};

export function normalizeSearchText(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(raw: string): string[] {
  const n = normalizeSearchText(raw);
  if (!n) return [];
  return n.split(' ').filter(Boolean);
}

export function singularize(token: string): string {
  if (SINGULAR_MAP[token]) return SINGULAR_MAP[token]!;
  if (token.length > 3 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('ses')) return token.slice(0, -2);
  if (token.length > 2 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

/** Primary query tokens (not alias expansions). */
export function primaryQueryTerms(query: string): string[] {
  const full = normalizeSearchText(query);
  const tokens = tokenize(query).map(singularize);
  return [...new Set([full, ...tokens].filter(Boolean))];
}

/**
 * Expand query with aliases + singular/plural variants (deduped).
 * Multi-word aliases are kept intact — their component words are NOT added.
 */
export function expandQueryTerms(query: string): string[] {
  const tokens = tokenize(query);
  const out = new Set<string>(primaryQueryTerms(query));

  for (const t of tokens) {
    const sing = singularize(t);
    const aliases = SEARCH_ALIASES[t] ?? SEARCH_ALIASES[sing];
    if (aliases) {
      for (const a of aliases) {
        out.add(normalizeSearchText(a));
      }
    }
  }
  return [...out].filter(Boolean);
}

function wholeWordIncludes(hay: string, term: string): boolean {
  if (!term) return false;
  if (term.includes(' ')) return hay.includes(term);
  const re = new RegExp(`(?:^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
  return re.test(hay);
}

/** Parse optional scope prefix: `mine:lamp`, `room:bed`, `actions:save`. */
export function parseScopedQuery(raw: string): { scope: SearchScope; query: string } {
  const trimmed = raw.trim();
  const m = trimmed.match(
    /^(all|toova|community|mine|room|checklist|actions)\s*:\s*(.*)$/i,
  );
  if (!m) return { scope: 'all', query: trimmed };
  return {
    scope: m[1]!.toLowerCase() as SearchScope,
    query: (m[2] ?? '').trim(),
  };
}

/** Levenshtein distance capped for short tokens. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 2) return 99;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array<number>(cols);
  const cur = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    cur[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j < cols; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

function bestTokenScore(queryTokens: string[], hayTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  let total = 0;
  for (const qt of queryTokens) {
    let best = 0;
    for (const ht of hayTokens) {
      if (ht === qt) {
        best = Math.max(best, 100);
      } else if (ht.startsWith(qt) || qt.startsWith(ht)) {
        best = Math.max(best, 70);
      } else if (ht.includes(qt) || qt.includes(ht)) {
        best = Math.max(best, 45);
      } else {
        const d = editDistance(qt, ht);
        if (d === 1 && qt.length >= 3) best = Math.max(best, 35);
        else if (d === 2 && qt.length >= 5) best = Math.max(best, 20);
      }
    }
    total += best;
  }
  return total / queryTokens.length;
}

/** Score a candidate against a query (0 = no match). Empty query → baseline. */
export function scoreCandidate(
  candidate: ScoredCandidate,
  query: string,
  opts?: {
    checklistKinds?: Set<string>;
    recentKinds?: string[];
  },
): number {
  const q = normalizeSearchText(query);
  const haystack = [
    candidate.label,
    ...(candidate.searchable ?? []),
    ...(candidate.aliases ?? []),
  ]
    .map(normalizeSearchText)
    .filter(Boolean);

  if (!q) {
    // Empty query: recents + checklist get a gentle bump; everything else baseline.
    let base = 10;
    if (candidate.recentIndex != null) base += 40 - candidate.recentIndex * 4;
    if (candidate.onChecklist) base += 8;
    if (candidate.section === 'actions') base += 5;
    return base;
  }

  const qTokens = tokenize(q).map(singularize);
  const primary = new Set(primaryQueryTerms(q));
  const expanded = expandQueryTerms(q);

  let best = 0;
  for (const hay of haystack) {
    if (hay === q) best = Math.max(best, 200);
    else if (hay.startsWith(q)) best = Math.max(best, 160);
    else if (wholeWordIncludes(hay, q)) best = Math.max(best, 145);
    else if (hay.includes(q)) best = Math.max(best, 120);

    for (const term of expanded) {
      if (term.length < 2) continue;
      const secondary = !primary.has(term);
      const exact = hay === term ? (secondary ? 90 : 150) : 0;
      const prefix = hay.startsWith(term) ? (secondary ? 55 : 110) : 0;
      const whole = wholeWordIncludes(hay, term) ? (secondary ? 45 : 100) : 0;
      const substr = !secondary && hay.includes(term) ? 80 : 0;
      best = Math.max(best, exact, prefix, whole, substr);
    }

    const hayTokens = tokenize(hay).map(singularize);
    best = Math.max(best, bestTokenScore(qTokens, hayTokens));
  }

  if (best <= 0) return 0;

  // Prefer specific multi-word labels (Desk lamp) over bare kind names (Lamp).
  const label = normalizeSearchText(candidate.label);
  if (label !== q && wholeWordIncludes(label, q) && label.split(' ').length > 1) {
    best += 25;
  }

  // Boosts — checklist products should beat generic builtins of the same family.
  if (candidate.onChecklist || (candidate.kind && opts?.checklistKinds?.has(candidate.kind))) {
    best += 70;
  }
  if (candidate.source === 'checklist') best += 12;
  if (candidate.alreadyInRoom) best += 4;
  if (candidate.recentIndex != null) {
    best += Math.max(0, 24 - candidate.recentIndex * 3);
  }
  if (candidate.fit != null) {
    best += candidate.fit * 8;
  }
  if (candidate.popularity != null) {
    best += Math.min(12, candidate.popularity / 12);
  }

  // Soft-demote free-floating light tool unless the query is about free/point lights.
  if (candidate.id === 'synth-free-light' || candidate.kind === 'free-light') {
    if (!/\bfree\b|\bpoint\b|\bbulb\b|\bfixture\b/.test(q) && q !== 'light' && q !== 'lights') {
      best -= 60;
    }
  }

  // Source priority tie-break helpers (small)
  const sourceBoost: Record<string, number> = {
    checklist: 8,
    toova: 3,
    synthetic: 2,
    room: 5,
    action: 2,
    mine: 1,
    community: 0,
    recent: 3,
  };
  best += sourceBoost[candidate.source] ?? 0;

  return Math.max(0, best);
}

/** Hollis-tight defaults: few strong rows per section. */
const DEFAULT_LIMITS: Record<SearchSection, number> = {
  add: 3,
  room: 2,
  actions: 2,
};

/**
 * Rank + truncate candidates. Stable sort by score desc, then label, then id.
 * Drops zero-score rows when query is non-empty.
 */
export function rankCandidates(
  candidates: ScoredCandidate[],
  opts: RankOptions,
): ScoredCandidate[] {
  const { query, checklistKinds, recentKinds } = opts;
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const recentIndex = new Map((recentKinds ?? []).map((k, i) => [k, i]));

  const scored = candidates
    .map((c) => {
      const withRecent =
        c.recentIndex ??
        (c.kind != null && recentIndex.has(c.kind) ? recentIndex.get(c.kind)! : c.recentIndex);
      const row: ScoredCandidate = { ...c, recentIndex: withRecent };
      if (c.kind && checklistKinds?.has(c.kind)) {
        row.onChecklist = true;
      }
      return { row, score: scoreCandidate(row, query, { checklistKinds, recentKinds }) };
    })
    .filter((x) => (normalizeSearchText(query) ? x.score > 0 : true))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const lab = a.row.label.localeCompare(b.row.label);
      if (lab !== 0) return lab;
      return a.row.id.localeCompare(b.row.id);
    });

  const bySection: Record<SearchSection, ScoredCandidate[]> = {
    add: [],
    room: [],
    actions: [],
  };
  /** Kinds already represented by a checklist product in Add. */
  const checklistClaimedKinds = new Set<string>();
  const seen = new Map<string, { score: number; preferChecklist: boolean }>();

  for (const { row, score } of scored) {
    const list = bySection[row.section];
    if (list.length >= limits[row.section]) continue;

    // Checklist products stay unique by id so Desk lamp + Floor lamp can both show.
    if (row.section === 'add' && row.source === 'checklist') {
      if (seen.has(row.id)) continue;
      seen.set(row.id, { score, preferChecklist: true });
      if (row.kind) checklistClaimedKinds.add(row.kind);
      list.push({ ...row, popularity: score });
      continue;
    }

    // Suppress generic catalog/synth of a kind already covered by checklist.
    if (row.section === 'add' && row.kind && checklistClaimedKinds.has(row.kind)) {
      continue;
    }

    const dedupeKey =
      row.section === 'add' && row.kind
        ? `kind:${row.kind}`
        : row.section === 'room' && row.kind
          ? `room:${row.kind}:${normalizeSearchText(row.label)}`
          : row.id;
    const preferChecklist = !!(row.onChecklist || row.source === 'checklist');
    const prev = seen.get(dedupeKey);
    if (prev) {
      if (preferChecklist && !prev.preferChecklist) {
        const idx = list.findIndex((x) =>
          row.kind && row.section === 'add'
            ? x.kind === row.kind
            : x.id === row.id,
        );
        if (idx >= 0) {
          list[idx] = { ...row, popularity: score };
          seen.set(dedupeKey, { score, preferChecklist });
        }
      }
      continue;
    }
    seen.set(dedupeKey, { score, preferChecklist });
    list.push({ ...row, popularity: score });
  }

  return [...bySection.add, ...bySection.room, ...bySection.actions];
}

/** Highlight ranges for the first occurrence of query tokens in label. */
export function highlightRanges(
  label: string,
  query: string,
): Array<{ start: number; end: number }> {
  const q = normalizeSearchText(query);
  if (!q || !label) return [];
  const lower = label.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];
  const terms = [...new Set([q, ...tokenize(q)])].filter((t) => t.length >= 2);
  for (const term of terms) {
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(term, from);
      if (idx < 0) break;
      ranges.push({ start: idx, end: idx + term.length });
      from = idx + term.length;
    }
  }
  // Merge overlaps
  ranges.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

export function parseSearchIntent(query: string): DesignerSearchIntent {
  const q = normalizeSearchText(query);
  if (!q) return { kind: 'generic' };

  // Lights on/off
  if (/\b(turn|switch|toggle)?\s*(the\s+)?(lamps?|lights?)\s+(on|off)\b/.test(q) ||
      /\b(lamps?|lights?)\s+(on|off)\b/.test(q)) {
    const on = /\bon\b/.test(q) && !/\boff\b/.test(q);
    const off = /\boff\b/.test(q);
    return { kind: 'toggle_lights', lightsOn: off ? false : on || !off };
  }
  if (/^(turn|switch)\s+(on|off)\s+(the\s+)?(lamps?|lights?)$/.test(q)) {
    return { kind: 'toggle_lights', lightsOn: /\bon\b/.test(q) };
  }

  // Wall paint / color
  const paintMatch = q.match(
    /(?:change\s+)?(?:wall\s+)?paint(?:\s+to)?\s+(.+)|(?:make\s+)?walls?\s+(\w+)|(?:paint|color)\s+(?:walls?\s+)?(.+)/,
  );
  if (paintMatch || /\b(wall\s+paint|change\s+walls?)\b/.test(q)) {
    const colorLabel = (paintMatch?.[1] || paintMatch?.[2] || paintMatch?.[3] || '').trim();
    return { kind: 'wall_paint', colorLabel: colorLabel || undefined };
  }

  // Camera
  if (/\b(top\s*(down|view)?|bird'?s?\s*eye)\b/.test(q)) {
    return { kind: 'camera', cameraPreset: 'topDown' };
  }
  if (/\b(desk\s*view|view\s*desk)\b/.test(q)) {
    return { kind: 'camera', cameraPreset: 'catalog' };
  }
  if (/\b(room\s*view|view\s*room|corner\s*view)\b/.test(q)) {
    return { kind: 'camera', cameraPreset: 'corner' };
  }

  // Edit selected
  if (/\b(edit|inspect|details)\b/.test(q) && /\b(selected|piece|item)\b/.test(q)) {
    return { kind: 'edit_selected' };
  }

  // Add intent
  if (/^(add|place|put)\b/.test(q)) {
    const rest = q.replace(/^(add|place|put)\s+(a|an|the)?\s*/, '');
    return { kind: 'add', furnitureHint: rest || undefined };
  }

  // Select kind in room
  if (/^(select|find|show)\b/.test(q)) {
    const rest = q.replace(/^(select|find|show)\s+(my|the|a|an)?\s*/, '');
    return { kind: 'select_kind', furnitureHint: rest || undefined };
  }

  return { kind: 'generic' };
}

/** Soft room-fit: how easily a piece of given footprint fits the room (0..1). */
export function softRoomFit(
  pieceW: number,
  pieceD: number,
  roomW: number,
  roomD: number,
): number {
  if (roomW <= 0 || roomD <= 0) return 0.5;
  const areaRatio = (pieceW * pieceD) / (roomW * roomD);
  if (areaRatio > 0.45) return 0.15;
  if (areaRatio > 0.25) return 0.4;
  if (pieceW > roomW * 0.9 || pieceD > roomD * 0.9) return 0.25;
  return Math.max(0.35, 1 - areaRatio * 1.5);
}

export function filterByScope(
  candidates: ScoredCandidate[],
  scope: SearchScope,
): ScoredCandidate[] {
  if (scope === 'all') return candidates;
  if (scope === 'actions') return candidates.filter((c) => c.section === 'actions');
  if (scope === 'room') return candidates.filter((c) => c.section === 'room');
  if (scope === 'checklist') {
    return candidates.filter((c) => c.source === 'checklist' || c.onChecklist);
  }
  if (scope === 'toova' || scope === 'community' || scope === 'mine') {
    return candidates.filter(
      (c) => c.source === scope || (scope === 'toova' && c.source === 'synthetic'),
    );
  }
  return candidates;
}
