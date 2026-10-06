import { describe, expect, it } from 'vitest';
import type { CuratedProduct } from './dormChecklist';
import {
  detectCatalogBankKind,
  isHangingDecorQuery,
  resolveCatalogBankProduct,
} from './agenticCatalogBankMatch';

function mockProduct(partial: Partial<CuratedProduct> & Pick<CuratedProduct, 'slug'>): CuratedProduct {
  return {
    id: partial.id ?? partial.slug,
    categoryId: 'cat-1',
    name: partial.name ?? partial.slug,
    description: partial.description ?? '',
    retailer: 'Amazon',
    affiliateUrl: 'https://example.com',
    priceCents: partial.priceCents ?? 3000,
    currency: 'USD',
    imagePath: null,
    imageUrl: null,
    sortOrder: 0,
    published: true,
    lastVerifiedAt: null,
    placeBuiltinKind: null,
    placeCatalogKind: partial.placeCatalogKind ?? null,
    placeHangingKind: partial.placeHangingKind ?? null,
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
  mockProduct({ slug: 'rug', name: 'Rug', placeCatalogKind: 'checklist-rug' }),
  mockProduct({ slug: 'fairlylights1', name: 'Fairy lights', placeHangingKind: 'lights' }),
  mockProduct({ slug: 'leaves', name: 'Artificial ivy leaves', placeHangingKind: 'leaves' }),
  mockProduct({ slug: 'fridge', name: 'Fridge', placeCatalogKind: 'custom-fridge' }),
];

describe('agenticCatalogBankMatch', () => {
  it('detects rug nouns with descriptive adjectives', () => {
    expect(detectCatalogBankKind('botanical rug')).toBe('rug');
    expect(detectCatalogBankKind('gothic area rug')).toBe('rug');
    expect(detectCatalogBankKind('Minecraft carpet')).toBe('rug');
  });

  it('detects hanging decor and fridge queries', () => {
    expect(detectCatalogBankKind('minecraft string lights')).toBe('string-lights');
    expect(detectCatalogBankKind('hanging ivy leaves')).toBe('leaves');
    expect(detectCatalogBankKind('mini fridge')).toBe('fridge');
  });

  it('resolves catalog products kind-first regardless of adjectives', () => {
    const rug = resolveCatalogBankProduct('botanical rug', catalog);
    expect(rug?.slug).toBe('rug');
    expect(rug?.placeCatalogKind).toBe('checklist-rug');

    const lights = resolveCatalogBankProduct('coastal string lights', catalog);
    expect(lights?.slug).toBe('fairlylights1');

    const leaves = resolveCatalogBankProduct('hanging ivy garland', catalog);
    expect(leaves?.slug).toBe('leaves');
  });

  it('marks string lights as hanging decor, not desk lamps', () => {
    expect(isHangingDecorQuery('minecraft string lights')).toBe(true);
    expect(isHangingDecorQuery('desk lamp')).toBe(false);
  });
});
