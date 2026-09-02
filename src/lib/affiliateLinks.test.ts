import { describe, expect, it } from 'vitest';
import {
  remapCheckedSlugsToIds,
  formatPriceCents,
  categoryIdsSatisfiedByPlacements,
  categoryIdsSatisfiedByPurchases,
  roomItemsToPlacementRefs,
  type ChecklistCategory,
  type ChecklistCategoryWithProducts,
  type CuratedProduct,
} from './dormChecklist';
import { amazonSearchUrl, resolveAffiliateForItem } from './affiliateLinks';
import {
  countRoomPlacementsForProduct,
  findRoomItemForProduct,
} from './placeCuratedProduct';
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

  it('marks checklist categories from drawn string lights and leaves', () => {
    const hangingProduct = (
      id: string,
      categoryId: string,
      slug: string,
      placeHangingKind: 'lights' | 'leaves' | 'led-strip',
    ): CuratedProduct => ({
      id,
      categoryId,
      slug,
      name: slug,
      description: '',
      retailer: 'amazon',
      affiliateUrl: '',
      priceCents: null,
      currency: 'USD',
      imagePath: null,
      imageUrl: null,
      sortOrder: 1,
      published: true,
      lastVerifiedAt: null,
      placeBuiltinKind: null,
      placeCatalogKind: null,
      placeHangingKind,
      placeBeddingKind: null,
      brand: null,
      featureBullets: [],
      dimensionsText: null,
      rating: null,
      reviewCount: null,
      availability: null,
    });

    const cats: ChecklistCategoryWithProducts[] = [
      {
        id: 'uuid-fairy',
        slug: 'fairy-lights',
        name: 'Fairy lights',
        sortOrder: 1,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [hangingProduct('prod-fairy', 'uuid-fairy', 'fairlylights1', 'lights')],
      },
      {
        id: 'uuid-led',
        slug: 'led-strips',
        name: 'LED strips',
        sortOrder: 2,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [hangingProduct('prod-led', 'uuid-led', 'led1', 'led-strip')],
      },
      {
        id: 'uuid-leaves',
        slug: 'leaves',
        name: 'Ivy garland',
        sortOrder: 3,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [hangingProduct('prod-leaves', 'uuid-leaves', 'leaves', 'leaves')],
      },
    ];

    const lightsPlaced = categoryIdsSatisfiedByPlacements(cats, [
      { kind: 'hanging', hangingKind: 'lights' },
    ]);
    expect([...lightsPlaced]).toEqual(['uuid-fairy']);

    const stripPlaced = categoryIdsSatisfiedByPlacements(cats, [
      { kind: 'hanging', hangingKind: 'led-strip' },
    ]);
    expect([...stripPlaced]).toEqual(['uuid-led']);

    const leavesPlaced = categoryIdsSatisfiedByPlacements(cats, [
      { kind: 'hanging', hangingKind: 'leaves' },
    ]);
    expect([...leavesPlaced]).toEqual(['uuid-leaves']);
  });

  it('marks bedding checklist categories when bed layers are enabled', () => {
    const beddingProduct = (
      id: string,
      categoryId: string,
      slug: string,
      placeBeddingKind: 'sheets' | 'comforter' | 'pillow',
    ): CuratedProduct => ({
      id,
      categoryId,
      slug,
      name: slug,
      description: '',
      retailer: 'amazon',
      affiliateUrl: '',
      priceCents: null,
      currency: 'USD',
      imagePath: null,
      imageUrl: null,
      sortOrder: 1,
      published: true,
      lastVerifiedAt: null,
      placeBuiltinKind: null,
      placeCatalogKind: null,
      placeHangingKind: null,
      placeBeddingKind,
      brand: null,
      featureBullets: [],
      dimensionsText: null,
      rating: null,
      reviewCount: null,
      availability: null,
    });

    const cats: ChecklistCategoryWithProducts[] = [
      {
        id: 'uuid-sheets',
        slug: 'bed-sheets',
        name: 'Bed Sheets',
        sortOrder: 1,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [beddingProduct('prod-sheets', 'uuid-sheets', 'bed-sheets', 'sheets')],
      },
      {
        id: 'uuid-comforter',
        slug: 'bed-comforter',
        name: 'Bed comforter',
        sortOrder: 2,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [
          beddingProduct('prod-comforter', 'uuid-comforter', 'bed-comforter', 'comforter'),
        ],
      },
      {
        id: 'uuid-pillows',
        slug: 'pillows',
        name: 'Pillows',
        sortOrder: 3,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [beddingProduct('prod-pillows', 'uuid-pillows', 'pillows', 'pillow')],
      },
    ];

    const items: Record<string, import('./dormChecklist').ChecklistPlacementItem> = {
      bed1: {
        kind: 'bed',
        beddingConfig: {
          version: 1,
          topper: { enabled: false },
          sheets: { enabled: true, colorId: 'white', patternId: 'solid' },
          comforter: { enabled: true, colorId: 'cream', patternId: 'solid' },
          pillows: {
            enabled: true,
            items: [
              {
                id: 'pillow-1',
                size: 'standard',
                colorId: 'white',
                patternId: 'solid',
              },
            ],
          },
        },
      },
    };

    const refs = roomItemsToPlacementRefs(items, ['bed1']);
    const placed = categoryIdsSatisfiedByPlacements(cats, refs);
    expect([...placed].sort()).toEqual(['uuid-comforter', 'uuid-pillows', 'uuid-sheets']);

    const sheetsOnly = roomItemsToPlacementRefs(
      {
        bed1: {
          kind: 'bed',
          beddingConfig: {
            version: 1,
            topper: { enabled: false },
            sheets: { enabled: true, colorId: 'white', patternId: 'solid' },
            comforter: { enabled: false, colorId: 'cream', patternId: 'solid' },
            pillows: { enabled: false, items: [] },
          },
        },
      },
      ['bed1'],
    );
    expect([...categoryIdsSatisfiedByPlacements(cats, sheetsOnly)]).toEqual(['uuid-sheets']);
  });

  it('marks hanging categories via product slug when placeHangingKind is unset', () => {
    const product: CuratedProduct = {
      id: 'prod-fairy',
      categoryId: 'uuid-fairy',
      slug: 'fairlylights1',
      name: 'Fairy lights',
      description: '',
      retailer: 'amazon',
      affiliateUrl: '',
      priceCents: null,
      currency: 'USD',
      imagePath: null,
      imageUrl: null,
      sortOrder: 1,
      published: true,
      lastVerifiedAt: null,
      placeBuiltinKind: null,
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
    const cats: ChecklistCategoryWithProducts[] = [
      {
        id: 'uuid-fairy',
        slug: 'fairy-lights',
        name: 'Fairy lights',
        sortOrder: 1,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [product],
      },
    ];
    const placed = categoryIdsSatisfiedByPlacements(cats, [
      { kind: 'hanging', hangingKind: 'lights' },
    ]);
    expect([...placed]).toEqual(['uuid-fairy']);
  });

  it('finds hanging room items for draw-mapped checklist products', () => {
    const product: CuratedProduct = {
      id: 'prod-fairy',
      categoryId: 'uuid-fairy',
      slug: 'fairlylights1',
      name: 'Fairy lights',
      description: '',
      retailer: 'amazon',
      affiliateUrl: '',
      priceCents: null,
      currency: 'USD',
      imagePath: null,
      imageUrl: null,
      sortOrder: 1,
      published: true,
      lastVerifiedAt: null,
      placeBuiltinKind: null,
      placeCatalogKind: null,
      placeHangingKind: 'lights',
      placeBeddingKind: null,
      brand: null,
      featureBullets: [],
      dimensionsText: null,
      rating: null,
      reviewCount: null,
      availability: null,
    };
    const items = {
      hang1: {
        id: 'hang1',
        kind: 'hanging',
        label: 'String lights',
        position: [0, 0, 0],
        rotationY: 0,
        size: [1, 1, 1],
        hanging: { kind: 'lights' as const, version: 1, anchors: [], sag: 0.14, density: 6, seed: 1, palette: ['#fff'], lightIntensity: 1, lightRange: 1 },
      },
    } as unknown as Record<string, Item>;
    expect(findRoomItemForProduct(product, items, ['hang1'])).toBe('hang1');
    expect(countRoomPlacementsForProduct(product, items, ['hang1'])).toBe(1);
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
        placeHangingKind: null,
      placeBeddingKind: null,
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

  it('does not match storage bins to dresser or bookshelf furniture', () => {
    const bins: CuratedProduct = {
      id: 'prod-bins',
      categoryId: 'uuid-storage',
      slug: 'storage-1',
      name: 'Storage bins',
      description: '',
      retailer: 'amazon',
      affiliateUrl: '',
      priceCents: 2999,
      currency: 'USD',
      imagePath: null,
      imageUrl: null,
      sortOrder: 10,
      published: true,
      lastVerifiedAt: null,
      placeBuiltinKind: null,
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
    const items = {
      dresser1: {
        id: 'dresser1',
        kind: 'dresser',
        label: 'Dresser',
        position: [0, 0, 0],
        rotationY: 0,
        size: [30, 32, 18],
      },
      shelf1: {
        id: 'shelf1',
        kind: 'bookshelf',
        label: 'Bookshelf',
        position: [0, 0, 0],
        rotationY: 0,
        size: [30, 32, 18],
      },
    } as unknown as Record<string, Item>;
    expect(findRoomItemForProduct(bins, items, ['dresser1', 'shelf1'])).toBeNull();
  });

  it('matches cube storage to bookshelf only', () => {
    const cube: CuratedProduct = {
      id: 'prod-cube',
      categoryId: 'uuid-storage',
      slug: 'storage-2',
      name: 'Cube storage',
      description: '',
      retailer: 'amazon',
      affiliateUrl: '',
      priceCents: 3999,
      currency: 'USD',
      imagePath: null,
      imageUrl: null,
      sortOrder: 20,
      published: true,
      lastVerifiedAt: null,
      placeBuiltinKind: 'bookshelf',
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
    const items = {
      dresser1: {
        id: 'dresser1',
        kind: 'dresser',
        label: 'Dresser',
        position: [0, 0, 0],
        rotationY: 0,
        size: [30, 32, 18],
      },
      shelf1: {
        id: 'shelf1',
        kind: 'bookshelf',
        label: 'Bookshelf',
        position: [0, 0, 0],
        rotationY: 0,
        size: [30, 32, 18],
      },
    } as unknown as Record<string, Item>;
    expect(findRoomItemForProduct(cube, items, ['dresser1', 'shelf1'])).toBe('shelf1');
  });

  it('marks checklist categories from imported GLBs via catalogKind', () => {
    const laptopProduct = (
      id: string,
      categoryId: string,
    ): CuratedProduct => ({
      id,
      categoryId,
      slug: 'laptop',
      name: 'Laptop',
      description: '',
      retailer: 'amazon',
      affiliateUrl: '',
      priceCents: null,
      currency: 'USD',
      imagePath: null,
      imageUrl: null,
      sortOrder: 1,
      published: true,
      lastVerifiedAt: null,
      placeBuiltinKind: null,
      placeCatalogKind: 'custom-laptop',
      placeHangingKind: null,
      placeBeddingKind: null,
      brand: null,
      featureBullets: [],
      dimensionsText: null,
      rating: null,
      reviewCount: null,
      availability: null,
    });

    const cats: ChecklistCategoryWithProducts[] = [
      {
        id: 'uuid-laptop',
        slug: 'laptop',
        name: 'Laptop',
        sortOrder: 1,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [laptopProduct('prod-laptop', 'uuid-laptop')],
      },
    ];

    const withCatalogKind = categoryIdsSatisfiedByPlacements(cats, [
      { kind: 'imported', catalogKind: 'custom-laptop' },
    ]);
    expect([...withCatalogKind]).toEqual(['uuid-laptop']);

    const bareImported = categoryIdsSatisfiedByPlacements(cats, [{ kind: 'imported' }]);
    expect([...bareImported]).toEqual([]);
  });

  it('marks every category that shares a catalog GLB kind', () => {
    const mirrorProduct = (id: string, categoryId: string, slug: string): CuratedProduct => ({
      id,
      categoryId,
      slug,
      name: 'Mirror',
      description: '',
      retailer: 'amazon',
      affiliateUrl: '',
      priceCents: null,
      currency: 'USD',
      imagePath: null,
      imageUrl: null,
      sortOrder: 1,
      published: true,
      lastVerifiedAt: null,
      placeBuiltinKind: null,
      placeCatalogKind: 'checklist-mirror',
      placeHangingKind: null,
      placeBeddingKind: null,
      brand: null,
      featureBullets: [],
      dimensionsText: null,
      rating: null,
      reviewCount: null,
      availability: null,
    });

    const cats: ChecklistCategoryWithProducts[] = [
      {
        id: 'uuid-misc-mirror',
        slug: 'misc-mirror',
        name: 'Mirror',
        sortOrder: 1,
        published: true,
        parentId: null,
        imagePath: null,
        imageUrl: null,
        products: [mirrorProduct('prod-misc-mirror', 'uuid-misc-mirror', 'mirror')],
      },
      {
        id: 'uuid-wall-mirror',
        slug: 'mirror',
        name: 'Mirror',
        sortOrder: 2,
        published: true,
        parentId: 'uuid-wall',
        imagePath: null,
        imageUrl: null,
        products: [mirrorProduct('prod-wall-mirror', 'uuid-wall-mirror', 'wallmirror')],
      },
    ];

    const placed = categoryIdsSatisfiedByPlacements(cats, [
      { kind: 'imported', catalogKind: 'checklist-mirror' },
    ]);
    expect([...placed].sort()).toEqual(['uuid-misc-mirror', 'uuid-wall-mirror']);
  });
});
