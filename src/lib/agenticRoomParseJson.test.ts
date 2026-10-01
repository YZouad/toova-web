import { describe, expect, it } from 'vitest';
import {
  extractJsonFromAgentText,
  extractRunTextFromCursorResponse,
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
    expect(result?.items).toHaveLength(2);
    expect(result?.items[0]?.estimatedCents).toBe(25000);
    expect(result?.roomType).toBe('dorm bedroom');
    expect(result?.theme).toBe('gothic');
    expect(result?.estimatedTotalCents).toBe(75000);
    expect(result?.source).toBe('cursor');
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
