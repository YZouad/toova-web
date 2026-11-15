import { describe, expect, it } from 'vitest';
import type { ChecklistCategoryWithProducts, CuratedProduct } from './dormChecklist';
import { mergeShoppingListEntries } from './dormChecklist';
import {
  buildPurchaseCartLines,
  productIdsToMirrorFromCart,
  purchaseCartTotalCents,
} from './purchaseCart';
import { checklistProgressCounts } from './checklistProgress';
import type { ChecklistLineModel } from './checklistLines';
import { createLocalChecklistProduct, mergeLocalProductsIntoCategories } from './localRoomChecklist';
import { createOwnedChecklistProduct } from './ownedChecklistItems';
import { manualShoppingEntry } from './shoppingListEntry';

const productA: CuratedProduct = {
  id: 'prod-a',
  categoryId: 'cat-a',
  slug: 'a',
  name: 'Lamp A',
  description: '',
  retailer: 'Amazon',
  affiliateUrl: 'https://example.com/a',
  asin: null,
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
      list: [manualShoppingEntry(productA.id)],
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
      list: [manualShoppingEntry(productA.id, 2)],
      productsById,
      getResolution: () => undefined,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.source).toBe('both');
    expect(lines[0]?.quantity).toBe(2);
  });

  it('excludes bare have resolutions without owned purchase details', () => {
    const lines = buildPurchaseCartLines({
      categories,
      items: {},
      order: [],
      list: [manualShoppingEntry(productA.id)],
      productsById,
      getResolution: (id) => (id === 'cat-a' ? 'have' : undefined),
    });
    expect(lines).toHaveLength(0);
  });

  it('includes owned items marked as already have', () => {
    const ownedProduct = createOwnedChecklistProduct({
      categoryId: 'cat-a',
      name: 'Thrifted lamp',
      affiliateUrl: 'https://www.amazon.com/dp/B000',
      priceCents: 2499,
    });
    const lines = buildPurchaseCartLines({
      categories,
      items: {},
      order: [],
      list: [manualShoppingEntry(ownedProduct.id)],
      productsById: { ...productsById, [ownedProduct.id]: ownedProduct },
      getResolution: (id) => (id === 'cat-a' ? 'have' : undefined),
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.source).toBe('owned');
    expect(lines[0]?.product.name).toContain('Thrifted lamp');
    expect(purchaseCartTotalCents(lines).sum).toBe(2499);
  });

  it('excludes skip resolutions', () => {
    const lines = buildPurchaseCartLines({
      categories,
      items: {},
      order: [],
      list: [manualShoppingEntry(productA.id)],
      productsById,
      getResolution: (id) => (id === 'cat-a' ? 'skip' : undefined),
    });
    expect(lines).toHaveLength(0);
  });

  it('includes a local imported model that was added to To Buy', () => {
    const localProduct = createLocalChecklistProduct({
      name: 'Imported desk',
      affiliateUrl: 'https://www.amazon.com/dp/B001',
      priceCents: 8900,
      catalogKind: 'custom-desk',
    });
    const localCategories = mergeLocalProductsIntoCategories([], [localProduct]);
    const lines = buildPurchaseCartLines({
      categories: localCategories,
      items: {},
      order: [],
      list: [manualShoppingEntry(localProduct.id)],
      productsById: { [localProduct.id]: { ...localProduct, categoryId: localProduct.id } },
      getResolution: () => undefined,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.product.name).toBe('Imported desk');
    expect(lines[0]?.source).toBe('list');
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
      list: [manualShoppingEntry(pencilProduct.id)],
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
      list: [manualShoppingEntry(productA.id, 2)],
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
        manualShoppingEntry(pencilProduct.id),
        manualShoppingEntry(unpricedProduct.id),
      ],
      productsById: pencilProductsById,
      getResolution: () => undefined,
    });
    expect(purchaseCartTotalCents(lines)).toEqual({ sum: 431, known: false });
  });
});

describe('mergeShoppingListEntries', () => {
  it('unions by product id with max quantity and merged reviewDone', () => {
    const merged = mergeShoppingListEntries(
      [manualShoppingEntry('remote-1')],
      [manualShoppingEntry('local:abc'), manualShoppingEntry('remote-1', 2, true)],
    );
    expect(merged.find((e) => e.productId === 'local:abc')?.quantity).toBe(1);
    expect(merged.find((e) => e.productId === 'remote-1')?.quantity).toBe(2);
    expect(merged.find((e) => e.productId === 'remote-1')?.reviewDone).toBe(true);
  });
});

describe('productIdsToMirrorFromCart', () => {
  it('returns room-only lines not already on the shopping list', () => {
    const lines = buildPurchaseCartLines({
      categories,
      items: {
        room1: { kind: 'lamp', curatedProductId: productA.id },
      },
      order: ['room1'],
      list: [],
      productsById,
      getResolution: () => undefined,
    });
    expect(productIdsToMirrorFromCart(lines, [])).toEqual([productA.id]);
    expect(
      productIdsToMirrorFromCart(lines, [manualShoppingEntry(productA.id)]),
    ).toEqual([]);
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
