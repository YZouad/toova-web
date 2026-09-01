import { describe, expect, it } from 'vitest';
import {
  checklistLineStatus,
  computeChecklistBudgetSummary,
  formatBudgetRemaining,
  isChecklistResolved,
  isChecklistToPlace,
  priceCentsForRoomItem,
  remainingCents,
  spentCentsForRoom,
  type ChecklistCategoryWithProducts,
  type CuratedProduct,
} from './dormChecklist';

const lampProduct: CuratedProduct = {
  id: 'prod-lamp',
  categoryId: 'cat-lamp',
  slug: 'lamp1',
  name: 'Desk Lamp',
  description: '',
  retailer: 'Amazon',
  affiliateUrl: 'https://example.com',
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
};

const deskProduct: CuratedProduct = {
  ...lampProduct,
  id: 'prod-desk',
  categoryId: 'cat-desk',
  slug: 'desk1',
  name: 'Desk',
  priceCents: 15000,
  placeBuiltinKind: 'desk',
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
    products: [lampProduct],
  },
  {
    id: 'cat-desk',
    slug: 'desk',
    name: 'Desk',
    sortOrder: 1,
    published: true,
    parentId: null,
    imagePath: null,
    imageUrl: null,
    products: [deskProduct],
  },
];

const productsById = {
  [lampProduct.id]: lampProduct,
  [deskProduct.id]: deskProduct,
};

describe('checklist line status', () => {
  it('derives placed, have, skip, and open states', () => {
    expect(checklistLineStatus(true, undefined)).toBe('placed');
    expect(checklistLineStatus(false, 'have')).toBe('have');
    expect(checklistLineStatus(false, 'skip')).toBe('skip');
    expect(checklistLineStatus(false, undefined)).toBe('open');
    expect(checklistLineStatus(true, 'have')).toBe('placed');
  });

  it('classifies to-place vs resolved', () => {
    expect(isChecklistToPlace('open')).toBe(true);
    expect(isChecklistToPlace('have')).toBe(false);
    expect(isChecklistResolved('placed')).toBe(true);
    expect(isChecklistResolved('open')).toBe(false);
  });
});

describe('checklist budget math', () => {
  it('sums curated product prices in the room', () => {
    const items = {
      a: { kind: 'lamp', curatedProductId: lampProduct.id },
      b: { kind: 'desk', curatedProductId: deskProduct.id },
    };
    expect(spentCentsForRoom(categories, items, ['a', 'b'], productsById)).toBe(17499);
  });

  it('refunds when an item is removed', () => {
    const items = {
      a: { kind: 'lamp', curatedProductId: lampProduct.id },
    };
    expect(spentCentsForRoom(categories, items, ['a'], productsById)).toBe(2499);
    expect(spentCentsForRoom(categories, items, [], productsById)).toBe(0);
  });

  it('uses cheapest leaf price for kind-only placements', () => {
    const items = {
      a: { kind: 'lamp' },
    };
    expect(priceCentsForRoomItem(items.a, categories, productsById)).toBe(2499);
  });

  it('computes remaining budget and over-budget label', () => {
    expect(remainingCents(100000, 2499)).toBe(97501);
    expect(formatBudgetRemaining(97501)).toBe('$975.01');
    expect(formatBudgetRemaining(-4200)).toBe('$42 over');
  });

  it('builds budget summary with spent-of-cap line', () => {
    const summary = computeChecklistBudgetSummary(100000, 15000);
    expect(summary.remainingLabel).toBe('$850');
    expect(summary.spentOfCapLabel).toBe('Spent $150 of $1,000');
  });
});
