import { describe, expect, it } from 'vitest';
import {
  applyNamedThemeToList,
  enrichFurnitureListWithTheme,
  extractJsonFromAgentText,
  extractRunTextFromCursorResponse,
  inferThemeFromPrompt,
  parseAgentTextToFurnitureList,
  validateFurnitureListJson,
} from './agenticRoomParseJson';

describe('extractJsonFromAgentText', () => {
  it('parses fenced JSON', () => {
    const raw = extractJsonFromAgentText('Here you go:\n```json\n{"items":[{"query":"bed","qty":1}]}\n```');
    expect(raw).toEqual({ items: [{ query: 'bed', qty: 1 }] });
  });

  it('parses bare JSON object', () => {
    const raw = extractJsonFromAgentText('{"items":[{"query":"desk","qty":2}]}');
    expect(raw).toEqual({ items: [{ query: 'desk', qty: 2 }] });
  });
});

describe('extractRunTextFromCursorResponse', () => {
  it('reads string result field from Cursor API', () => {
    expect(
      extractRunTextFromCursorResponse({
        status: 'FINISHED',
        result: '{"items":[{"query":"rug","qty":1}]}',
      }),
    ).toBe('{"items":[{"query":"rug","qty":1}]}');
  });
});

describe('validateFurnitureListJson', () => {
  it('accepts valid payload with estimates and room metadata', () => {
    const result = validateFurnitureListJson({
      widthIn: 120,
      depthIn: 144,
      budgetCents: 80000,
      roomType: 'dorm bedroom',
      theme: 'gothic',
      vibe: 'moody',
      estimatedTotalCents: 75000,
      items: [
        { query: 'queen bed frame', qty: 1, estimatedCents: 25000 },
        { query: 'area rug', qty: 1, estimatedCents: 50000 },
      ],
    });
    expect(result?.items[0]?.query).toBe('queen bed frame');
    expect(result?.items[1]?.query).toBe('gothic area rug');
    expect(result?.items.map((item) => item.query)).toEqual(
      expect.arrayContaining([
        'gothic wall poster',
        'gothic string lights',
        'gothic bedding set',
      ]),
    );
    expect(result?.items[0]?.estimatedCents).toBe(25000);
    expect(result?.roomType).toBe('dorm bedroom');
    expect(result?.theme).toBe('gothic');
    expect(result?.estimatedTotalCents).toBe(75000 + 1500 + 1800 + 4500);
    expect(result?.source).toBe('cursor');
  });

  it('leaves generic vibes alone and does not double-apply a theme', () => {
    const once = applyNamedThemeToList({
      theme: 'Minecraft',
      items: [
        { query: 'twin XL bed frame', qty: 1, estimatedCents: 20000 },
        { query: 'area rug', qty: 1, estimatedCents: 4000 },
      ],
      warnings: [],
      source: 'cursor',
    });
    expect(once.items.map((item) => item.query)).toEqual(
      expect.arrayContaining([
        'twin XL bed frame',
        'Minecraft area rug',
        'Minecraft wall poster',
        'Minecraft string lights',
        'Minecraft bedding set',
      ]),
    );
    const twice = applyNamedThemeToList(once);
    expect(twice.items).toEqual(once.items);

    const cozy = validateFurnitureListJson({
      theme: 'cozy',
      items: [{ query: 'area rug', qty: 1, estimatedCents: 4000 }],
    });
    expect(cozy?.items.map((item) => item.query)).toEqual(['area rug']);
  });

  it('sums line estimates when total omitted', () => {
    const result = validateFurnitureListJson({
      items: [
        { query: 'lamp', qty: 1, estimatedCents: 3000 },
        { query: 'rug', qty: 1, estimatedCents: 7000 },
      ],
    });
    expect(result?.estimatedTotalCents).toBe(10000);
  });

  it('rejects empty items', () => {
    expect(validateFurnitureListJson({ items: [] })).toBeNull();
  });
});

describe('inferThemeFromPrompt', () => {
  it('finds named themes in casual phrasing', () => {
    expect(inferThemeFromPrompt('minecraft dorm with a desk')).toBe('minecraft');
    expect(inferThemeFromPrompt('small room, gothic vibe, queen bed')).toBe('gothic');
    expect(inferThemeFromPrompt('theme is cottagecore')).toBe('cottagecore');
  });

  it('ignores generic style words', () => {
    expect(inferThemeFromPrompt('minimal cozy dorm')).toBeUndefined();
    expect(inferThemeFromPrompt('modern studio apartment')).toBeUndefined();
  });
});

describe('enrichFurnitureListWithTheme', () => {
  it('infers theme from user prompt when Cursor omits theme field', () => {
    const enriched = enrichFurnitureListWithTheme(
      {
        items: [
          { query: 'twin xl bed frame', qty: 1, estimatedCents: 20000 },
          { query: 'area rug', qty: 1, estimatedCents: 4000 },
        ],
        warnings: [],
        source: 'cursor',
      },
      'minecraft dorm, need desk and bed',
    );
    expect(enriched.theme).toBe('minecraft');
    expect(enriched.items.map((item) => item.query)).toEqual(
      expect.arrayContaining(['minecraft area rug', 'minecraft wall poster']),
    );
  });
});

describe('parseAgentTextToFurnitureList', () => {
  it('end-to-end from assistant prose', () => {
    const text = `\`\`\`json
{
  "widthIn": 120,
  "depthIn": 144,
  "roomType": "dorm bedroom",
  "items": [
    { "query": "loft bed", "qty": 1, "estimatedCents": 20000 },
    { "query": "desk lamp", "qty": 1, "estimatedCents": 2500 }
  ]
}
\`\`\``;
    const result = parseAgentTextToFurnitureList(text);
    expect(result?.items.map((i) => i.query)).toEqual(['loft bed', 'desk lamp']);
    expect(result?.estimatedTotalCents).toBe(22500);
  });
});
