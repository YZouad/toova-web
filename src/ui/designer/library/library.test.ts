import { describe, expect, it } from 'vitest';
import { isNewCatalogModel, formatPlacedCount } from './libraryBadges';
import { nextRovingIndex } from './useRovingGrid';
import { buildShoppableIndex } from './useShoppableProducts';
import type { ChecklistCategoryWithProducts } from '../../../lib/dormChecklist';

describe('isNewCatalogModel', () => {
  it('flags items within 14 days', () => {
    const now = Date.parse('2026-11-05T12:00:00Z');
    expect(isNewCatalogModel('2026-11-01T00:00:00Z', now)).toBe(true);
    expect(isNewCatalogModel('2026-10-01T00:00:00Z', now)).toBe(false);
    expect(isNewCatalogModel(null, now)).toBe(false);
  });
});

describe('formatPlacedCount', () => {
  it('compacts thousands', () => {
    expect(formatPlacedCount(42)).toBe('42');
    expect(formatPlacedCount(1200)).toBe('1.2k');
    expect(formatPlacedCount(12000)).toBe('12k');
  });
});

describe('nextRovingIndex', () => {
  it('moves within a 3-column grid', () => {
    expect(nextRovingIndex(0, 'ArrowRight', 9, 3)).toBe(1);
    expect(nextRovingIndex(1, 'ArrowLeft', 9, 3)).toBe(0);
    expect(nextRovingIndex(1, 'ArrowDown', 9, 3)).toBe(4);
    expect(nextRovingIndex(4, 'ArrowUp', 9, 3)).toBe(1);
    expect(nextRovingIndex(4, 'Home', 9, 3)).toBe(0);
    expect(nextRovingIndex(4, 'End', 9, 3)).toBe(8);
  });
});

describe('buildShoppableIndex', () => {
  it('indexes published place kinds only', () => {
    const categories = [
      {
        id: 'c1',
        slug: 'seating',
        name: 'Seating',
        sortOrder: 0,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [
          {
            id: 'p1',
            categoryId: 'c1',
            slug: 'chair',
            name: 'Chair',
            description: '',
            retailer: 'Amazon',
            affiliateUrl: 'https://example.com',
            asin: null,
            priceCents: 9900,
            currency: 'USD',
            imagePath: null,
            imageUrl: null,
            sortOrder: 0,
            published: true,
            lastVerifiedAt: null,
            placeBuiltinKind: 'chair',
            placeCatalogKind: null,
            placeHangingKind: null,
            placeBeddingKind: null,
            brand: null,
            featureBullets: [],
            dimensionsText: null,
            rating: null,
            reviewCount: null,
            availability: null,
          },
          {
            id: 'p2',
            categoryId: 'c1',
            slug: 'hidden',
            name: 'Hidden',
            description: '',
            retailer: 'Amazon',
            affiliateUrl: 'https://example.com',
            asin: null,
            priceCents: 100,
            currency: 'USD',
            imagePath: null,
            imageUrl: null,
            sortOrder: 1,
            published: false,
            lastVerifiedAt: null,
            placeBuiltinKind: 'desk',
            placeCatalogKind: 'desk-custom',
            placeHangingKind: null,
            placeBeddingKind: null,
            brand: null,
            featureBullets: [],
            dimensionsText: null,
            rating: null,
            reviewCount: null,
            availability: null,
          },
        ],
      },
    ] as ChecklistCategoryWithProducts[];

    const map = buildShoppableIndex(categories);
    expect(map.get('chair')?.id).toBe('p1');
    expect(map.has('desk')).toBe(false);
    expect(map.has('desk-custom')).toBe(false);
  });
});
