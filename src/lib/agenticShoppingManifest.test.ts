import { describe, expect, it } from 'vitest';
import {
  manifestFromResolved,
  manifestSearchOnlyEntries,
} from './agenticShoppingManifest';
import type { AgenticReviewRow } from './agenticRoomResolveFromList';

function mockRow(partial: Partial<AgenticReviewRow> & { query: string }): AgenticReviewRow {
  return {
    query: partial.query,
    qty: partial.qty ?? 1,
    product: partial.product ?? null,
    alternates: partial.alternates ?? [],
    score: partial.score ?? 0,
    builtinKind: partial.builtinKind ?? null,
    warnings: partial.warnings ?? [],
    searchOffers: partial.searchOffers ?? [],
    placeInRoom: partial.placeInRoom ?? false,
    communityModel: partial.communityModel ?? null,
    bankPoster: partial.bankPoster ?? null,
  };
}

describe('agenticShoppingManifest', () => {
  it('preserves all resolved rows in manifest', () => {
    const rows = [
      mockRow({ query: 'Minecraft bedding set' }),
      mockRow({ query: 'desk', product: { id: 'p-desk' } as AgenticReviewRow['product'] }),
    ];
    const manifest = manifestFromResolved(rows);
    expect(manifest).toHaveLength(2);
    expect(manifest[0]?.query).toBe('Minecraft bedding set');
  });

  it('filters catalog-backed rows already on shopping list', () => {
    const manifest = manifestFromResolved([
      mockRow({ query: 'desk', product: { id: 'p-desk' } as AgenticReviewRow['product'] }),
      mockRow({ query: 'Minecraft bedding set' }),
    ]);
    const searchOnly = manifestSearchOnlyEntries(manifest, new Set(['p-desk']));
    expect(searchOnly).toHaveLength(1);
    expect(searchOnly[0]?.query).toBe('Minecraft bedding set');
  });
});
