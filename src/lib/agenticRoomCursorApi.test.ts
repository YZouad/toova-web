import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchFurnitureListFromCursor } from './agenticRoomCursorApi';

describe('fetchFurnitureListFromCursor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty list when proxy fails (no rules parser fallback)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    const result = await fetchFurnitureListFromCursor(
      '12×10 dorm bedroom, gothic theme, under $800',
    );
    expect(result.source).toBe('rules-fallback');
    expect(result.items).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('dev:agentic'))).toBe(true);
  });

  it('uses Cursor result when proxy succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            items: [
              { query: 'queen bed frame', qty: 1, estimatedCents: 25000 },
              { query: 'area rug', qty: 1, estimatedCents: 8000 },
            ],
            widthIn: 120,
            depthIn: 144,
            roomType: 'dorm bedroom',
            theme: 'gothic',
            estimatedTotalCents: 33000,
            warnings: [],
            source: 'cursor',
          },
        }),
      }),
    );

    const result = await fetchFurnitureListFromCursor('12×10 dorm bedroom, gothic theme');
    expect(result.source).toBe('cursor');
    expect(result.items.map((item) => item.query)).toEqual(
      expect.arrayContaining([
        'queen bed frame',
        'gothic area rug',
        'gothic wall poster',
        'gothic string lights',
        'gothic bedding set',
      ]),
    );
  });
});
