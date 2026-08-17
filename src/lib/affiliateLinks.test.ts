import { describe, expect, it } from 'vitest';
import {
  remapCheckedSlugsToIds,
  formatPriceCents,
  categoryIdsSatisfiedByPlacements,
  categoryIdsSatisfiedByPurchases,
  type ChecklistCategory,
  type ChecklistCategoryWithProducts,
} from './dormChecklist';
import { amazonSearchUrl, resolveAffiliateForItem } from './affiliateLinks';
import type { Item } from '../store';

describe('shopping checklist helpers', () => {
  it('formats price cents', () => {
    expect(formatPriceCents(2499)).toBe('$24.99');
    expect(formatPriceCents(null)).toBeNull();
  });

  it('remaps legacy slug checked ids to category uuids', () => {
    const cats: ChecklistCategory[] = [
      { id: 'uuid-lamp', slug: 'lamp', name: 'Lamp', sortOrder: 1, published: true, parentId: null, imagePath: null, imageUrl: null },
      { id: 'uuid-desk', slug: 'desk', name: 'Desk', sortOrder: 2, published: true, parentId: null, imagePath: null, imageUrl: null },
    ];
    const remapped = remapCheckedSlugsToIds(new Set(['lamp', 'uuid-desk', 'gone']), cats);
    expect([...remapped].sort()).toEqual(['uuid-desk', 'uuid-lamp']);
  });

  it('marks checklist categories from room placements', () => {
    const cats: ChecklistCategoryWithProducts[] = [
      {
        id: 'uuid-lamp',
        slug: 'lamp',
        name: 'Lamp',
        sortOrder: 1,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [
          {
            id: 'prod-lamp',
            categoryId: 'uuid-lamp',
            slug: 'desk-lamp',
            name: 'Lamp',
            description: '',
            retailer: 'amazon',
            affiliateUrl: 'https://example.com',
            priceCents: 1000,
            currency: 'USD',
            imagePath: null,
            imageUrl: null,
            sortOrder: 1,
            published: true,
            lastVerifiedAt: null,
            placeBuiltinKind: 'lamp',
            placeCatalogKind: null,
            brand: null,
            featureBullets: [],
            dimensionsText: null,
            rating: null,
            reviewCount: null,
            availability: null,
          },
        ],
      },
      {
        id: 'uuid-desk',
        slug: 'desk',
        name: 'Desk',
        sortOrder: 2,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [
          {
            id: 'prod-desk',
            categoryId: 'uuid-desk',
            slug: 'desk',
            name: 'Desk',
            description: '',
            retailer: 'amazon',
            affiliateUrl: 'https://example.com',
            priceCents: null,
            currency: 'USD',
            imagePath: null,
            imageUrl: null,
            sortOrder: 1,
            published: true,
            lastVerifiedAt: null,
            placeBuiltinKind: 'desk',
            placeCatalogKind: null,
            brand: null,
            featureBullets: [],
            dimensionsText: null,
            rating: null,
            reviewCount: null,
            availability: null,
          },
        ],
      },
      {
        id: 'uuid-towel',
        slug: 'towel',
        name: 'Towel',
        sortOrder: 3,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [],
      },
    ];
    const placed = categoryIdsSatisfiedByPlacements(cats, [
      { kind: 'desk' },
      { kind: 'lamp', curatedProductId: 'prod-lamp' },
    ]);
    expect([...placed].sort()).toEqual(['uuid-desk', 'uuid-lamp']);
  });

  it('marks checklist categories from shopping list purchases', () => {
    const cats: ChecklistCategoryWithProducts[] = [
      {
        id: 'uuid-strips',
        slug: 'command-strips',
        name: 'Command Strips',
        sortOrder: 1,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [
          {
            id: 'prod-strips',
            categoryId: 'uuid-strips',
            slug: 'command-strips',
            name: 'Command Strips',
            description: '',
            retailer: 'amazon',
            affiliateUrl: 'https://example.com',
            priceCents: 1299,
            currency: 'USD',
            imagePath: null,
            imageUrl: null,
            sortOrder: 1,
            published: true,
            lastVerifiedAt: null,
            placeBuiltinKind: null,
            placeCatalogKind: null,
            brand: null,
            featureBullets: [],
            dimensionsText: null,
            rating: null,
            reviewCount: null,
            availability: null,
          },
        ],
      },
      {
        id: 'uuid-lamp',
        slug: 'lamp',
        name: 'Lamp',
        sortOrder: 2,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [
          {
            id: 'prod-lamp',
            categoryId: 'uuid-lamp',
            slug: 'lamp',
            name: 'Lamp',
            description: '',
            retailer: 'amazon',
            affiliateUrl: 'https://example.com',
            priceCents: 1899,
            currency: 'USD',
            imagePath: null,
            imageUrl: null,
            sortOrder: 1,
            published: true,
            lastVerifiedAt: null,
            placeBuiltinKind: 'lamp',
            placeCatalogKind: null,
            brand: null,
            featureBullets: [],
            dimensionsText: null,
            rating: null,
            reviewCount: null,
            availability: null,
          },
        ],
      },
    ];
    const satisfied = categoryIdsSatisfiedByPurchases(cats, [], ['prod-strips']);
    expect([...satisfied]).toEqual(['uuid-strips']);
  });

  it('builds amazon search urls', () => {
    const url = amazonSearchUrl('dorm desk lamp');
    expect(url).toContain('https://www.amazon.com/s?');
    expect(url).toContain('k=dorm');
  });

  it('uses exact offer when curated product is present', () => {
    const item = {
      id: '1',
      kind: 'lamp',
      label: 'Warm desk lamp',
      position: [0, 0, 0],
      rotationY: 0,
      size: [10, 22, 10],
      curatedProductId: 'prod-1',
    } as Item;
    const offers = resolveAffiliateForItem(item, {
      'prod-1': {
        id: 'prod-1',
        categoryId: 'c1',
        slug: 'warm',
        name: 'Warm desk lamp',
        description: 'Nice lamp',
        retailer: 'Amazon',
        affiliateUrl: 'https://amzn.to/example',
        priceCents: 2499,
        currency: 'USD',
        imagePath: null,
        imageUrl: null,
        sortOrder: 0,
        published: true,
        lastVerifiedAt: null,
        placeBuiltinKind: 'lamp',
        placeCatalogKind: null,
        brand: null,
        featureBullets: [],
        dimensionsText: null,
        rating: null,
        reviewCount: null,
        availability: null,
      },
    });
    expect(offers).toHaveLength(1);
    expect(offers[0].approximate).toBe(false);
    expect(offers[0].url).toBe('https://amzn.to/example');
  });

  it('falls back to shop-similar for unverified imports', () => {
    const item = {
      id: '2',
      kind: 'imported',
      label: 'My weird chair',
      position: [0, 0, 0],
      rotationY: 0,
      size: [20, 30, 20],
    } as Item;
    const offers = resolveAffiliateForItem(item);
    expect(offers[0].approximate).toBe(true);
    expect(offers[0].label).toContain('Shop similar');
    expect(offers[0].url).toContain('amazon.com/s');
  });
});
