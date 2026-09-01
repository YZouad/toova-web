import { describe, expect, it } from 'vitest';
import {
  expandQueryTerms,
  highlightRanges,
  normalizeSearchText,
  parseScopedQuery,
  parseSearchIntent,
  rankCandidates,
  scoreCandidate,
  softRoomFit,
  tokenize,
  editDistance,
  filterByScope,
} from './designerSearch';
import type { ScoredCandidate } from '../ui/designer/commandSearchTypes';

function cand(partial: Partial<ScoredCandidate> & Pick<ScoredCandidate, 'id' | 'label'>): ScoredCandidate {
  return {
    section: 'add',
    source: 'toova',
    searchable: [partial.label],
    ...partial,
  };
}

describe('normalizeSearchText', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeSearchText("  Desk-Lamp!! ")).toBe('desk lamp');
  });
});

describe('tokenize + expandQueryTerms', () => {
  it('expands lamp aliases without leaking bare desk/floor/light tokens', () => {
    const terms = expandQueryTerms('lamp');
    expect(terms).toContain('lamp');
    expect(terms).toContain('lighting');
    expect(terms).toContain('desk lamp');
    expect(terms).toContain('floor lamp');
    expect(terms).toContain('string lights');
    // Multi-word alias components must not become independent scorers.
    expect(terms).not.toContain('desk');
    expect(terms).not.toContain('floor');
    expect(terms).not.toContain('light');
  });

  it('tokenizes multi-word queries', () => {
    expect(tokenize('Desk Lamp')).toEqual(['desk', 'lamp']);
  });
});

describe('editDistance', () => {
  it('detects single-char typos', () => {
    expect(editDistance('lamp', 'lammp')).toBe(1);
    expect(editDistance('lamp', 'lnmp')).toBe(1);
  });
});

describe('scoreCandidate + rankCandidates', () => {
  it('ranks exact label above fuzzy', () => {
    const a = cand({ id: '1', label: 'Lamp', kind: 'lamp' });
    const b = cand({ id: '2', label: 'Laptop', kind: 'imported' });
    expect(scoreCandidate(a, 'lamp')).toBeGreaterThan(scoreCandidate(b, 'lamp'));
  });

  it('boosts checklist kinds', () => {
    const base = cand({ id: '1', label: 'Desk lamp', kind: 'lamp' });
    const withList = cand({ id: '2', label: 'Desk lamp', kind: 'lamp', onChecklist: true });
    expect(scoreCandidate(withList, 'lamp')).toBeGreaterThan(scoreCandidate(base, 'lamp'));
  });

  it('prefers specific checklist lamps over bare builtin Lamp', () => {
    const ranked = rankCandidates(
      [
        cand({ id: 'builtin', label: 'Lamp', kind: 'lamp', source: 'toova' }),
        cand({
          id: 'cl-desk',
          label: 'Desk lamp',
          kind: 'lamp',
          source: 'checklist',
          onChecklist: true,
        }),
        cand({
          id: 'cl-floor',
          label: 'Floor lamp',
          kind: 'lamp',
          source: 'checklist',
          onChecklist: true,
        }),
        cand({
          id: 'synth-free-light',
          label: 'Free light',
          kind: 'free-light',
          source: 'synthetic',
          searchable: ['free light', 'bulb'],
        }),
        cand({
          id: 'action-floor',
          label: 'Edit floor plan',
          section: 'actions',
          source: 'action',
        }),
      ],
      { query: 'lamp' },
    );
    const add = ranked.filter((r) => r.section === 'add');
    expect(add.map((r) => r.id)).toEqual(expect.arrayContaining(['cl-desk', 'cl-floor']));
    expect(add.map((r) => r.id)).not.toContain('builtin');
    expect(add.map((r) => r.id)).not.toContain('synth-free-light');
    expect(ranked.some((r) => r.id === 'action-floor')).toBe(false);
  });

  it('keeps distinct checklist products of the same kind', () => {
    const ranked = rankCandidates(
      [
        cand({
          id: 'a',
          label: 'Desk lamp',
          kind: 'lamp',
          source: 'checklist',
          onChecklist: true,
        }),
        cand({
          id: 'b',
          label: 'Floor lamp',
          kind: 'lamp',
          source: 'checklist',
          onChecklist: true,
        }),
      ],
      { query: 'lamp' },
    );
    expect(ranked.filter((r) => r.kind === 'lamp')).toHaveLength(2);
  });

  it('suppresses catalog twin when checklist claims the kind', () => {
    const ranked = rankCandidates(
      [
        cand({ id: 'a', label: 'Lamp', kind: 'lamp', source: 'toova' }),
        cand({
          id: 'b',
          label: 'Desk lamp',
          kind: 'lamp',
          source: 'checklist',
          onChecklist: true,
        }),
      ],
      { query: 'lamp' },
    );
    expect(ranked.filter((r) => r.kind === 'lamp')).toHaveLength(1);
    expect(ranked[0]!.id).toBe('b');
  });

  it('respects section limits', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      cand({ id: `m${i}`, label: `Lamp ${i}`, kind: `lamp-${i}` }),
    );
    const ranked = rankCandidates(many, { query: 'lamp', limits: { add: 3 } });
    expect(ranked.filter((r) => r.section === 'add')).toHaveLength(3);
  });

  it('defaults to Hollis-tight section caps', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      cand({ id: `m${i}`, label: `Lamp ${i}`, kind: `lamp-${i}` }),
    );
    const actions = Array.from({ length: 10 }, (_, i) =>
      cand({
        id: `a${i}`,
        label: `Turn the lamps ${i}`,
        section: 'actions',
        source: 'action',
      }),
    );
    const ranked = rankCandidates([...many, ...actions], { query: 'lamp' });
    expect(ranked.filter((r) => r.section === 'add').length).toBeLessThanOrEqual(3);
    expect(ranked.filter((r) => r.section === 'actions').length).toBeLessThanOrEqual(2);
  });

  it('returns empty for non-matching query', () => {
    const ranked = rankCandidates([cand({ id: '1', label: 'Bed', kind: 'bed' })], {
      query: 'zzzz',
    });
    expect(ranked).toHaveLength(0);
  });
});

describe('highlightRanges', () => {
  it('finds query substring', () => {
    const ranges = highlightRanges('Desk lamp', 'lamp');
    expect(ranges.some((r) => r.start === 5 && r.end === 9)).toBe(true);
  });
});

describe('parseSearchIntent', () => {
  it('parses light toggle', () => {
    expect(parseSearchIntent('Turn the lamps on')).toMatchObject({
      kind: 'toggle_lights',
      lightsOn: true,
    });
    expect(parseSearchIntent('lights off')).toMatchObject({
      kind: 'toggle_lights',
      lightsOn: false,
    });
  });

  it('parses camera intents', () => {
    expect(parseSearchIntent('top view')).toMatchObject({
      kind: 'camera',
      cameraPreset: 'topDown',
    });
  });

  it('parses add intent', () => {
    expect(parseSearchIntent('add a lamp')).toMatchObject({
      kind: 'add',
      furnitureHint: 'lamp',
    });
  });

  it('parses wall paint', () => {
    expect(parseSearchIntent('change wall paint to sage')).toMatchObject({
      kind: 'wall_paint',
      colorLabel: 'sage',
    });
  });
});

describe('parseScopedQuery', () => {
  it('extracts scope prefix', () => {
    expect(parseScopedQuery('mine:lamp')).toEqual({ scope: 'mine', query: 'lamp' });
    expect(parseScopedQuery('lamp')).toEqual({ scope: 'all', query: 'lamp' });
  });
});

describe('softRoomFit', () => {
  it('penalizes oversized pieces', () => {
    expect(softRoomFit(10, 10, 120, 160)).toBeGreaterThan(softRoomFit(100, 100, 120, 160));
  });
});

describe('filterByScope', () => {
  it('filters to room section', () => {
    const rows = [
      cand({ id: '1', label: 'Lamp', section: 'add', source: 'toova' }),
      cand({ id: '2', label: 'Twin Bed', section: 'room', source: 'room' }),
    ];
    expect(filterByScope(rows, 'room')).toHaveLength(1);
  });
});
