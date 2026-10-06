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
    id: 'p-rug',
    slug: 'rug',
    name: 'Rug',
    description: 'area rug dorm',
    priceCents: 3500,
    placeCatalogKind: 'checklist-rug',
  }),
  mockProduct({
    id: 'p-lights',
    slug: 'fairlylights1',
    name: 'Fairy lights',
    description: 'string lights dorm decor',
    priceCents: 1800,
    placeHangingKind: 'lights',
  }),
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
  it('kind-first matches descriptive rug and string light queries to bank products', () => {
    const result = resolveAgenticItems(
      {
        widthIn: 120,
        depthIn: 144,
        items: [
          { query: 'botanical rug', qty: 1 },
          { query: 'minecraft string lights', qty: 1 },
        ],
      },
      catalog,
    );
    expect(result.items[0]?.product?.slug).toBe('rug');
    expect(result.items[0]?.query).toBe('botanical rug');
    expect(result.items[1]?.product?.slug).toBe('fairlylights1');
    expect(result.items[1]?.builtinKind).toBeNull();
  });

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

  it('does not match bed frame queries to pillow products', () => {
    const withPillow = [
      ...catalog,
      mockProduct({
        id: 'p-pillow',
        name: 'Pillows',
        description: 'work in bed pillow set',
        priceCents: 1200,
      }),
    ];
    const result = resolveAgenticItems(
      {
        widthIn: 120,
        depthIn: 144,
        items: [{ query: 'twin XL bed frame', qty: 1 }],
      },
      withPillow,
    );
    expect(result.items[0]?.product?.id).not.toBe('p-pillow');
  });

  it('matches queen bed frame to bed catalog product', () => {
    const withFrame = [
      ...catalog,
      mockProduct({
        id: 'p-bed-frame',
        name: 'Queen Metal Bed Frame',
        description: 'queen size bed frame',
        placeBuiltinKind: 'bed',
      }),
    ];
    const result = resolveAgenticItems(
      {
        widthIn: 120,
        depthIn: 144,
        items: [{ query: 'queen bed frame', qty: 1 }],
      },
      withFrame,
    );
    expect(result.items[0]?.product?.id).toBe('p-bed-frame');
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

  it('does not attach a themed search to an unrelated catalog product', () => {
    const withCutlery = [
      ...catalog,
      mockProduct({
        id: 'p-cutlery',
        name: 'Cutlery / plates',
        description: 'dinnerware set',
        priceCents: 2200,
      }),
      mockProduct({
        id: 'p-comforter',
        name: 'Bed comforter',
        description: 'twin bedding',
        priceCents: 4500,
        placeBuiltinKind: 'bed',
      }),
    ];
    const result = resolveAgenticItems(
      {
        widthIn: 144,
        depthIn: 120,
        items: [
          { query: 'Minecraft twin XL bedding set', qty: 1 },
          { query: 'twin XL bed frame', qty: 1 },
        ],
      },
      withCutlery,
    );
    expect(result.items[0]?.product).toBeNull();
    expect(result.items[1]?.product?.id).not.toBe('p-comforter');
    expect(result.items[1]?.product?.id).not.toBe('p-cutlery');
  });

  it('matches study desk to desk builtin, not desk lamp product', () => {
    const withWarmLamp = catalog
      .filter((p) => p.placeBuiltinKind !== 'desk')
      .concat([
        mockProduct({
          id: 'p-warm-lamp',
          name: 'Warm desk lamp',
          description: 'study desk lamp warm light',
          priceCents: 3000,
          placeBuiltinKind: 'lamp',
        }),
      ]);
    const result = resolveAgenticItems(
      {
        widthIn: 120,
        depthIn: 144,
        items: [{ query: 'study desk', qty: 1 }],
      },
      withWarmLamp,
    );
    expect(result.items[0]?.product?.id).not.toBe('p-warm-lamp');
    expect(result.items[0]?.builtinKind).toBe('desk');
  });

  it('matches a wood desk lamp to a lamp, not a desk', () => {
    const result = resolveAgenticItems(
      {
        widthIn: 120,
        depthIn: 144,
        items: [{ query: 'wood desk lamp', qty: 1 }],
      },
      catalog,
    );
    expect(result.items[0]?.product).toBeNull();
    expect(result.items[0]?.builtinKind).toBe('lamp');
  });

  it('does not place a desk pad or desk organizer as a desk', () => {
    const result = resolveAgenticItems(
      {
        widthIn: 120,
        depthIn: 144,
        items: [
          { query: 'brown rugged fancy desk pad', qty: 1 },
          { query: 'desk organizer set brown', qty: 1 },
        ],
      },
      catalog,
    );
    expect(result.items[0]?.builtinKind).toBeNull();
    expect(result.items[0]?.product).toBeNull();
    expect(result.items[1]?.builtinKind).toBeNull();
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
