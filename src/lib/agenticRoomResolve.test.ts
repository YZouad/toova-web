import { describe, expect, it } from 'vitest';
import type { CuratedProduct } from './dormChecklist';
import {
  AGENTIC_MATCH_MIN_SCORE,
  resolveAgenticItems,
  optimizeForBudget,
} from './agenticRoomResolve';
import type { AgenticRoomRequest } from './agenticRoomPrompt';

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
  mockProduct({
    id: 'p-bed',
    name: 'Twin XL Mattress Topper',
    description: 'bedding dorm mattress',
    priceCents: 8000,
    placeBuiltinKind: 'bed',
  }),
  mockProduct({
    id: 'p-desk',
    name: 'Foldable Desk',
    description: 'study workspace desk',
    priceCents: 12000,
    placeBuiltinKind: 'desk',
  }),
  mockProduct({
    id: 'p-lamp',
    name: 'Desk Lamp LED',
    description: 'desk lamp lighting',
    priceCents: 2500,
    placeBuiltinKind: 'lamp',
  }),
  mockProduct({
    id: 'p-lamp-cheap',
    name: 'Basic Clip Lamp',
    description: 'small lamp',
    priceCents: 1500,
    placeBuiltinKind: 'lamp',
  }),
];

describe('resolveAgenticItems', () => {
  it('matches bed and desk to catalog products', () => {
    const request: AgenticRoomRequest = {
      widthIn: 120,
      depthIn: 144,
      items: [
        { query: 'bed', qty: 1 },
        { query: 'desk', qty: 1 },
      ],
    };
    const result = resolveAgenticItems(request, catalog);
    expect(result.items[0]?.product?.id).toBe('p-bed');
    expect(result.items[1]?.product?.id).toBe('p-desk');
    expect(result.items.every((i) => i.score >= AGENTIC_MATCH_MIN_SCORE || i.builtinKind)).toBe(true);
  });

  it('flags over budget when total cannot be optimized down', () => {
    const request: AgenticRoomRequest = {
      widthIn: 120,
      depthIn: 144,
      budgetCents: 100,
      items: [
        { query: 'bed', qty: 1 },
        { query: 'desk', qty: 1 },
      ],
    };
    const result = resolveAgenticItems(request, catalog);
    expect(result.totalCents).toBeGreaterThan(100);
    expect(result.overBudget).toBe(true);
  });

  it('falls back to builtin when no product match', () => {
    const request: AgenticRoomRequest = {
      widthIn: 120,
      depthIn: 144,
      items: [{ query: 'chair', qty: 1 }],
    };
    const result = resolveAgenticItems(request, catalog);
    expect(result.items[0]?.builtinKind).toBe('chair');
    expect(result.items[0]?.warnings.length).toBeGreaterThan(0);
  });

  it('optimizeForBudget prefers cheaper lamp', () => {
    const resolved = resolveAgenticItems(
      {
        widthIn: 120,
        depthIn: 144,
        budgetCents: 10000,
        items: [{ query: 'lamp', qty: 1 }],
      },
      catalog,
    );
    const lampItem = resolved.items.find((i) => i.query === 'lamp');
    expect(lampItem?.product?.id).toMatch(/p-lamp/);
  });
});

describe('optimizeForBudget', () => {
  it('swaps to cheaper product when over budget', () => {
    const items = resolveAgenticItems(
      {
        widthIn: 120,
        depthIn: 144,
        items: [{ query: 'lamp', qty: 1 }],
      },
      catalog,
    ).items;
    const primary = items[0]!;
    primary.product = catalog.find((p) => p.id === 'p-lamp')!;
    const optimized = optimizeForBudget(items, 2000, catalog);
    expect(optimized[0]?.product?.id).toBe('p-lamp-cheap');
  });
});
