import { describe, expect, it } from 'vitest';
import type { CuratedProduct } from '../dormChecklist';
import { resolveAgenticItems } from '../agenticRoomResolve';
import {
  normalizeReviseAddQuery,
  refineReviseAddRow,
} from './reviseAddResolve';
import { resolvePendingAddProposal } from './pendingAdd';

function mockProduct(partial: Partial<CuratedProduct> & Pick<CuratedProduct, 'id' | 'name'>): CuratedProduct {
  return {
    categoryId: 'cat-1',
    slug: partial.slug ?? partial.id,
    description: partial.description ?? '',
    retailer: 'Amazon',
    affiliateUrl: 'https://example.com',
    priceCents: partial.priceCents ?? 5000,
    currency: 'USD',
    imagePath: null,
    imageUrl: null,
    sortOrder: 0,
    published: true,
    lastVerifiedAt: null,
    placeBuiltinKind: partial.placeBuiltinKind ?? null,
    placeCatalogKind: partial.placeCatalogKind ?? null,
    placeHangingKind: null,
    placeBeddingKind: partial.placeBeddingKind ?? null,
    brand: null,
    featureBullets: [],
    dimensionsText: null,
    rating: null,
    reviewCount: null,
    availability: null,
    ...partial,
  };
}

describe('normalizeReviseAddQuery', () => {
  it('maps bare bed requests to twin bed frame', () => {
    expect(normalizeReviseAddQuery('bed')).toBe('twin bed frame');
    expect(normalizeReviseAddQuery('add two beds')).toContain('twin bed frame');
  });
});

describe('refineReviseAddRow', () => {
  const catalog: CuratedProduct[] = [
    mockProduct({
      id: 'bins',
      name: 'Storage bins',
      description: 'under bed storage dorm',
    }),
    mockProduct({
      id: 'bed-frame',
      name: 'Twin XL Bed Frame',
      description: 'metal bed frame dorm',
      placeBuiltinKind: 'bed',
    }),
    mockProduct({
      id: 'comforter',
      name: 'Bed comforter',
      placeBeddingKind: 'comforter',
    }),
  ];

  it('prefers twin bed frame over storage bins for bed queries', () => {
    const row = resolveAgenticItems(
      { widthIn: 120, depthIn: 144, heightIn: 96, items: [{ query: 'bed', qty: 1 }] },
      catalog,
    ).items[0]!;
    const refined = refineReviseAddRow('bed', row, catalog);
    expect(refined.product?.id).toBe('bed-frame');
    expect(refined.alternates.some((p) => p.id === 'bins')).toBe(false);
    expect(refined.alternates.some((p) => p.id === 'comforter')).toBe(false);
  });
});

describe('resolvePendingAddProposal', () => {
  it('defaults to builtin bed when no placeable catalog match', () => {
    const proposal = resolvePendingAddProposal('bed', [
      mockProduct({ id: 'bins', name: 'Storage bins', description: 'storage' }),
    ]);
    expect(proposal?.candidate.builtinKind).toBe('bed');
    expect(proposal?.candidate.product).toBeNull();
    expect(proposal?.candidate.label).toBe('Twin Bed');
  });
});
