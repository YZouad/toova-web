import { describe, expect, it } from 'vitest';
import type { ChecklistCategoryWithProducts, CuratedProduct } from './dormChecklist';
import { manualShoppingEntry } from './shoppingListEntry';
import { countProductsInRoom, reconcileRoomShoppingList } from './reconcileRoomShoppingList';

const productA: CuratedProduct = {
  id: 'prod-a',
  categoryId: 'cat-lamp',
  slug: 'lamp-a',
  name: 'Lamp A',
  description: '',
  retailer: 'Amazon',
  affiliateUrl: 'https://example.com',
  asin: null,
  priceCents: 1000,
  currency: 'USD',
  imagePath: null,
  imageUrl: null,
  sortOrder: 0,
  published: true,
  lastVerifiedAt: null,
  placeBuiltinKind: 'lamp',
  placeCatalogKind: null,
  placeHangingKind: null,
  placeBeddingKind: null,
  brand: null,
  featureBullets: [],
  dimensionsText: null,
  rating: null,
  reviewCount: null,
  availability: null,
};

const categories: ChecklistCategoryWithProducts[] = [
  {
    id: 'cat-lamp',
    slug: 'lamp',
    name: 'Lamp',
    sortOrder: 0,
    published: true,
    parentId: null,
    imagePath: null,
    imageUrl: null,
    roomTags: [],
    products: [productA],
  },
];

describe('reconcileRoomShoppingList', () => {
  it('sets room quantity from placements and preserves manual quantity', () => {
    const roomCounts = new Map([['prod-a', 2]]);
    const current = [manualShoppingEntry('prod-a', 3)];
    const next = reconcileRoomShoppingList({ roomCounts, current });
    expect(next).toHaveLength(1);
    expect(next[0].roomQuantity).toBe(2);
    expect(next[0].manualQuantity).toBe(3);
    expect(next[0].quantity).toBe(3);
  });

  it('keeps manual-only rows when nothing is placed', () => {
    const next = reconcileRoomShoppingList({
      roomCounts: new Map(),
      current: [manualShoppingEntry('prod-a', 1)],
    });
    expect(next).toHaveLength(1);
    expect(next[0].manualQuantity).toBe(1);
    expect(next[0].roomQuantity).toBe(0);
  });

  it('counts duplicate placements', () => {
    const counts = countProductsInRoom({
      categories,
      items: {
        i1: { kind: 'lamp', curatedProductId: 'prod-a' },
        i2: { kind: 'lamp', curatedProductId: 'prod-a' },
      },
      order: ['i1', 'i2'],
      productsById: { 'prod-a': productA },
    });
    expect(counts.get('prod-a')).toBe(2);
  });
});