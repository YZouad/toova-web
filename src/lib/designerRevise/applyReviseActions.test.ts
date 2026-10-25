import { describe, expect, it, beforeEach } from 'vitest';
import type { CuratedProduct } from '../dormChecklist';
import { useStore } from '../../store';
import { applyReviseActions, restoreReviseUndo } from './applyReviseActions';
import { resolvePendingAddProposal } from './pendingAdd';

function mockProduct(partial: Partial<CuratedProduct> & Pick<CuratedProduct, 'id' | 'name'>): CuratedProduct {
  return {
    categoryId: 'cat-1',
    slug: partial.slug ?? partial.id,
    description: partial.description ?? '',
    retailer: 'Amazon',
    affiliateUrl: 'https://example.com',
    asin: null,
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
    id: 'p-desk',
    name: 'Foldable Desk',
    description: 'study workspace desk',
    placeBuiltinKind: 'desk',
  }),
];

describe('applyReviseActions', () => {
  beforeEach(() => {
    useStore.getState().resetLayout();
  });

  it('applies wall paint immediately', () => {
    const result = applyReviseActions([{ type: 'paint_wall', color: '#aabbcc' }], catalog);
    expect(result.appliedSummaries.length).toBe(1);
    expect(useStore.getState().environment.appearance.wallColor).toBe('#aabbcc');
  });

  it('returns pending add without mutating item count', () => {
    const before = useStore.getState().order.length;
    const result = applyReviseActions(
      [{ type: 'add_item', query: 'desk', placement: 'center' }],
      catalog,
    );
    expect(result.pendingAdds).toHaveLength(1);
    expect(useStore.getState().order.length).toBe(before);
  });

  it('restore undo reverts paint', () => {
    const before = useStore.getState().environment.appearance.wallColor;
    const result = applyReviseActions([{ type: 'paint_wall', color: '#010203' }], catalog);
    expect(useStore.getState().environment.appearance.wallColor).toBe('#010203');
    expect(result.undoSnapshot).not.toBeNull();
    restoreReviseUndo(result.undoSnapshot!);
    expect(useStore.getState().environment.appearance.wallColor).toBe(before);
  });

  it('defers bulk remove confirmation', () => {
    const { addItem } = useStore.getState();
    const ids = [addItem('lamp'), addItem('lamp'), addItem('lamp'), addItem('lamp')];
    const result = applyReviseActions(
      ids.map((itemId) => ({ type: 'remove_item', target: { itemId } })),
      catalog,
    );
    expect(result.pendingRemoves).not.toBeNull();
    expect(useStore.getState().order.length).toBe(4);
  });
});

describe('resolvePendingAddProposal', () => {
  it('resolves desk to builtin or product', () => {
    const proposal = resolvePendingAddProposal('desk', catalog);
    expect(proposal?.candidate.product?.placeBuiltinKind).toBe('desk');
  });
});
