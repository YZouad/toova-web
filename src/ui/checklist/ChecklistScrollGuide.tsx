import { useMemo } from 'react';
import {
  filterCategoriesByRoomTag,
  leafCategories,
  type CategoryResolution,
  type ChecklistBudgetSummary,
  type ChecklistCategoryWithProducts,
  type CuratedProduct,
} from '../../lib/dormChecklist';
import { roomTagLabel, type RoomTag } from '../../lib/roomTags';
import { Banner, Button, MonoMeta, Spinner } from '../kit';
import { ChecklistBudgetFoot } from '../designer/ChecklistBudgetFoot';
import { ChecklistItemSection } from './ChecklistItemSection';

interface ChecklistScrollGuideProps {
  roomTag: RoomTag;
  categories: ChecklistCategoryWithProducts[];
  loading: boolean;
  error: string | null;
  done: number;
  total: number;
  budgetSummary: ChecklistBudgetSummary;
  onSetBudget: (cents: number | null) => void;
  purchaseCartCount: number;
  onOpenCheckout: () => void;
  onChangeRoom: () => void;
  onOpenLists?: () => void;
  canPlace: boolean;
  placedCategoryIds: Set<string>;
  getOwnedProduct: (productId: string) => CuratedProduct | undefined;
  getResolution: (categoryId: string) => CategoryResolution | undefined;
  onRequestAddToList?: (product: CuratedProduct) => void;
  onPlace?: (product: CuratedProduct) => void;
  markCategoryAsOwned?: (input: {
    categoryId: string;
    name: string;
    affiliateUrl: string;
    priceCents: number;
  }) => void;
  setResolution: (categoryId: string, resolution: CategoryResolution | null) => Promise<void>;
}

export function ChecklistScrollGuide({
  roomTag,
  categories,
  loading,
  error,
  done,
  total,
  budgetSummary,
  onSetBudget,
  purchaseCartCount,
  onOpenCheckout,
  onChangeRoom,
  onOpenLists,
  canPlace,
  placedCategoryIds,
  getOwnedProduct,
  getResolution,
  onRequestAddToList,
  onPlace,
  markCategoryAsOwned,
  setResolution,
}: ChecklistScrollGuideProps) {
  const leaves = useMemo(() => {
    const scoped = filterCategoriesByRoomTag(categories, roomTag);
    return leafCategories(scoped);
  }, [categories, roomTag]);

  return (
    <div className="checklist-scroll-guide">
      <div className="checklist-scroll-guide__sticky">
        <div className="checklist-scroll-guide__meta">
          <div className="checklist-room-chip">
            <MonoMeta size="sm" tone="dense" upper>
              {roomTagLabel(roomTag)} checklist
            </MonoMeta>
            <MonoMeta size="sm" tone="subtle">
              {done} of {total} resolved
            </MonoMeta>
            <button type="button" className="shopping-lists-header-link" onClick={onChangeRoom}>
              Change room type
            </button>
            {onOpenLists ? (
              <button type="button" className="shopping-lists-header-link" onClick={onOpenLists}>
                My checklists
              </button>
            ) : null}
          </div>
          <div className="checklist-scroll-guide__budget">
            <ChecklistBudgetFoot
              budget={budgetSummary}
              onSetBudget={onSetBudget}
            />
            {purchaseCartCount > 0 ? (
              <Button size="sm" variant="outline" onClick={onOpenCheckout}>
                Review cart ({purchaseCartCount})
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <p className="checklist-scroll-guide__lede">
        Scroll through each category, compare product options, and add picks to any checklist you
        have saved.
      </p>

      {loading ? <Spinner label="Loading catalog…" /> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      {!loading && !error
        ? leaves.map((cat) => {
            const resolution = getResolution(cat.id);
            const placed = placedCategoryIds.has(cat.id);
            return (
              <ChecklistItemSection
                key={cat.id}
                category={cat}
                placed={placed}
                resolution={resolution}
                ownedProduct={getOwnedProduct(cat.id)}
                canPlace={canPlace}
                onRequestAddToList={onRequestAddToList}
                onPlace={onPlace}
                onMarkOwned={
                  markCategoryAsOwned
                    ? (input) => markCategoryAsOwned({ categoryId: cat.id, ...input })
                    : undefined
                }
                onSkip={() => void setResolution(cat.id, 'skip')}
                onUndo={() => void setResolution(cat.id, null)}
              />
            );
          })
        : null}
    </div>
  );
}
