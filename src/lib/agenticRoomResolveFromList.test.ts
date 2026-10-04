import { describe, expect, it } from 'vitest';
import type { CuratedProduct } from './dormChecklist';
import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import { resolveAgenticList } from './agenticRoomResolveFromList';
import { inches } from '../units';

function mockProduct(partial: Partial<CuratedProduct> & Pick<CuratedProduct, 'id' | 'name'>): CuratedProduct {
  return {
    categoryId: 'cat-1',
    slug: partial.slug ?? partial.id,
    description: partial.description ?? '',
    retailer: 'Amazon',
    affiliateUrl: partial.affiliateUrl ?? 'https://www.amazon.com/dp/example',
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
    placeBeddingKind: null,
    brand: null,
    featureBullets: [],
    dimensionsText: null,
    rating: null,
    reviewCount: null,
    availability: null,
    ...partial,
  };
}

const catalog: CuratedProduct[] = [
  mockProduct({ id: 'p-desk', name: 'Dorm Desk', placeBuiltinKind: 'desk' }),
];

describe('resolveAgenticList', () => {
  it('attaches catalog product with affiliate url for matched items', () => {
    const list: AgenticFurnitureListResult = {
      items: [{ query: 'desk', qty: 1 }],
      widthIn: inches(10),
      depthIn: inches(12),
      warnings: [],
      source: 'cursor',
    };
    const result = resolveAgenticList(list, catalog);
    expect(result.items[0]?.product?.id).toBe('p-desk');
    expect(result.items[0]?.searchOffers).toHaveLength(0);
  });

  it('attaches bank poster match for themed poster lines without catalog product', () => {
    const list: AgenticFurnitureListResult = {
      items: [{ query: 'gothic cathedral architecture wall poster', qty: 1 }],
      theme: 'gothic',
      warnings: [],
      source: 'cursor',
    };
    const result = resolveAgenticList(list, catalog);
    expect(result.items[0]?.product).toBeNull();
    expect(result.items[0]?.bankPoster?.kind).toBe('poster-gothic-cathedral');
    expect(result.items[0]?.placeInRoom).toBe(true);
  });

  it('clears shelf warnings when bank poster matches', () => {
    const list: AgenticFurnitureListResult = {
      items: [{ query: 'minecraft green pixel block landscape wall poster', qty: 1 }],
      theme: 'minecraft',
      warnings: [],
      source: 'cursor',
    };
    const result = resolveAgenticList(list, catalog, 'minecraft dorm');
    expect(result.items[0]?.bankPoster?.kind).toMatch(/poster-pixel/);
    expect(result.items[0]?.builtinKind).toBeNull();
    expect(result.items[0]?.warnings).toEqual([]);
  });

  it('attaches Amazon and Google search offers when no catalog match', () => {
    const list: AgenticFurnitureListResult = {
      items: [{ query: 'gothic wall tapestry', qty: 1 }],
      warnings: [],
      source: 'cursor',
    };
    const result = resolveAgenticList(list, catalog);
    expect(result.items[0]?.product).toBeNull();
    expect(result.items[0]?.searchOffers).toHaveLength(2);
    expect(result.items[0]?.searchOffers[0]?.url).toContain('amazon.com/s');
    expect(result.items[0]?.searchOffers[1]?.url).toContain('google.com/search');
  });
});
