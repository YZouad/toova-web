import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('./agenticRoomAuth', () => ({
  AGENTIC_ROOM_DEBUG: false,
  agenticRoomAuthHeaders: vi.fn(async () => ({
    headers: { Authorization: 'Bearer test-token' },
    diagnostics: {
      route: 'parse',
      hasSession: true,
      userId: 'test-user',
      userEmail: null,
      tokenLength: 10,
      expiresAt: null,
      expiresInSec: null,
      sentAuthorization: true,
      getSessionError: null,
    },
  })),
  explainAgenticRoomAuthError: (_d: unknown, err: string) => err,
  logAgenticRoomResponse: vi.fn(),
}));

import { fetchAgenticFurnitureList } from './agenticRoomParseApi';

describe('fetchAgenticFurnitureList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty list when proxy fails (no rules parser fallback)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    const result = await fetchAgenticFurnitureList(
      '12×10 dorm bedroom, gothic theme, under $800',
    );
    expect(result.source).toBe('rules-fallback');
    expect(result.items).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('Bedrock') || w.includes('toova-bff'))).toBe(
      true,
    );
  });

  it('uses Bedrock result when proxy succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
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
              source: 'bedrock',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const result = await fetchAgenticFurnitureList('12×10 dorm bedroom, gothic theme');
    expect(result.source).toBe('bedrock');
    expect(result.items.map((item) => item.query)).toEqual(
      expect.arrayContaining([
        'queen bed frame',
        'gothic area rug',
        'Gothic cathedral architecture wall poster',
        'desk',
        'desk lamp',
      ]),
    );
  });
});
