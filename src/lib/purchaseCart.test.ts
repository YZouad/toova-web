import { describe, expect, it } from 'vitest';
import type { ChecklistCategoryWithProducts, CuratedProduct } from './dormChecklist';
import { buildPurchaseCartLines, purchaseCartTotalCents } from './purchaseCart';
import { checklistProgressCounts } from './checklistProgress';
import type { ChecklistLineModel } from './checklistLines';

const productA: CuratedProduct = {
  id: 'prod-a',
  categoryId: 'cat-a',
  slug: 'a',
  name: 'Lamp A',
  description: '',
  retailer: 'Amazon',
  affiliateUrl: 'https://example.com/a',
  priceCents: 2000,
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

const productB: CuratedProduct = {
  ...productA,
  id: 'prod-b',
  categoryId: 'cat-b',
  slug: 'b',
  name: 'Desk B',
  priceCents: 10000,
  placeBuiltinKind: 'desk',
};

const categories: ChecklistCategoryWithProducts[] = [
  {
    id: 'cat-a',
    slug: 'lamp',
    name: 'Lamp',
    sortOrder: 0,
    published: true,
    parentId: null,
    imagePath: null,
    imageUrl: null,
    products: [productA],
  },
  {
    id: 'cat-b',
    slug: 'desk',
    name: 'Desk',
    sortOrder: 1,
    published: true,
    parentId: null,
    imagePath: null,
    imageUrl: null,
    products: [productB],
  },
];

const productsById = { [productA.id]: productA, [productB.id]: productB };

describe('buildPurchaseCartLines', () => {
  it('includes list entries and room placements, deduped', () => {
    const lines = buildPurchaseCartLines({
      categories,
      items: {
        room1: { kind: 'desk', curatedProductId: productB.id },
      },
      order: ['room1'],
      list: [{ productId: productA.id, quantity: 1, reviewDone: false }],
      productsById,
      getResolution: () => undefined,
    });
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.productId === productA.id)?.source).toBe('list');
    expect(lines.find((l) => l.productId === productB.id)?.source).toBe('room');
  });

  it('marks both when same product is on list and in room', () => {
    const lines = buildPurchaseCartLines({
      categories,
      items: {
        room1: { kind: 'lamp', curatedProductId: productA.id },
      },
      order: ['room1'],
      list: [{ productId: productA.id, quantity: 2, reviewDone: false }],
      productsById,
      getResolution: () => undefined,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.source).toBe('both');
    expect(lines[0]?.quantity).toBe(2);
  });

  it('excludes have/skip categories', () => {
    const lines = buildPurchaseCartLines({
      categories,
      items: {},
      order: [],
      list: [{ productId: productA.id, quantity: 1, reviewDone: false }],
      productsById,
      getResolution: (id) => (id === 'cat-a' ? 'have' : undefined),
    });
    expect(lines).toHaveLength(0);
  });
});

describe('purchaseCartTotalCents', () => {
  const pencilProduct: CuratedProduct = {
    ...productA,
    id: 'prod-pencil',
    categoryId: 'cat-pencil',
    slug: 'pencils',
    name: 'Wood pencils',
    priceCents: 431,
    placeBuiltinKind: null,
  };

  const unpricedProduct: CuratedProduct = {
    ...productA,
    id: 'prod-pillow',
    categoryId: 'cat-pillow',
    slug: 'pillow',
    name: 'Work in bed pillow',
    priceCents: null,
    placeBuiltinKind: null,
  };

  const pencilCategories: ChecklistCategoryWithProducts[] = [
    {
      id: 'cat-pencil',
      slug: 'pencils',
      name: 'Pencils',
      sortOrder: 0,
      published: true,
      parentId: null,
      imagePath: null,
      imageUrl: null,
      products: [pencilProduct],
    },
    {
      id: 'cat-pillow',
      slug: 'pillow',
      name: 'Pillow',
      sortOrder: 1,
      published: true,
      parentId: null,
      imagePath: null,
      imageUrl: null,
      products: [unpricedProduct],
    },
  ];

  const pencilProductsById = {
    [pencilProduct.id]: pencilProduct,
    [unpricedProduct.id]: unpricedProduct,
  };

  it('counts list-only priced items toward the total', () => {
    const lines = buildPurchaseCartLines({
      categories: pencilCategories,
      items: {},
      order: [],
      list: [{ productId: pencilProduct.id, quantity: 1, reviewDone: false }],
      productsById: pencilProductsById,
      getResolution: () => undefined,
    });
    expect(purchaseCartTotalCents(lines)).toEqual({ sum: 431, known: true });
  });

  it('does not double-count when the same product is on list and in room', () => {
    const lines = buildPurchaseCartLines({
      categories,
      items: {
        room1: { kind: 'lamp', curatedProductId: productA.id },
      },
      order: ['room1'],
      list: [{ productId: productA.id, quantity: 2, reviewDone: false }],
      productsById,
      getResolution: () => undefined,
    });
    expect(purchaseCartTotalCents(lines)).toEqual({ sum: 4000, known: true });
  });

  it('skips unpriced lines in the sum but marks total as incomplete', () => {
    const lines = buildPurchaseCartLines({
      categories: pencilCategories,
      items: {},
      order: [],
      list: [
        { productId: pencilProduct.id, quantity: 1, reviewDone: false },
        { productId: unpricedProduct.id, quantity: 1, reviewDone: false },
      ],
      productsById: pencilProductsById,
      getResolution: () => undefined,
    });
    expect(purchaseCartTotalCents(lines)).toEqual({ sum: 431, known: false });
  });
});

describe('checklistProgressCounts', () => {
  it('counts one slot per category and accounts for resolved items', () => {
    const lines: ChecklistLineModel[] = [
      { categoryId: '1', status: 'placed' } as ChecklistLineModel,
      { categoryId: '2', status: 'open' } as ChecklistLineModel,
      { categoryId: '3', status: 'have' } as ChecklistLineModel,
    ];
    const counts = checklistProgressCounts(lines);
    expect(counts.total).toBe(3);
    expect(counts.placed).toBe(1);
    expect(counts.todo).toBe(1);
    expect(counts.resolved).toBe(1);
    expect(counts.placed + counts.todo + counts.resolved).toBe(3);
  });
});
