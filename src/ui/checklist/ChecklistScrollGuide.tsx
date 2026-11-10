import React from 'react';

interface ChecklistScrollGuideProps {
  roomTag: string;
  categories: any[];
  loading: boolean;
  error: string | null;
  done: number;
  total: number;
  budgetSummary: any;
  onSetBudget: (cents: number) => void;
  purchaseCartCount: number;
  onOpenCheckout: () => void;
  onChangeRoom: () => void;
  canPlace: boolean;
  isCategoryDone: (categoryId: string) => boolean;
  placedCategoryIds: Set<string>;
  getOwnedProduct: (productId: string) => any;
  getResolution: (categoryId: string) => any;
  onPlaceClick?: (categoryId: string) => void;
  resolvedPlaceMenuMap?: Map<string, any>;
  onClickProduct?: (product: any) => void;
  onQuickAdd?: (productId: string) => void;
  setResolution: (categoryId: string, resolution: any) => Promise<void>;
  onDeclineClick?: (categoryId: string) => void;
  onReconsiderDeclinedClick?: (categoryId: string) => void;
  onMarkPlacedManually?: (categoryId: string, input: any) => void;
  onRequestAddToList?: (product: any) => void;
  onPlace?: (product: any) => void;
  markCategoryAsOwned?: (input: any) => void;
}

export function ChecklistScrollGuide(props: ChecklistScrollGuideProps) {
  const { categories, roomTag, done, total } = props;
  
  return (
    <div className="checklist-scroll-guide">
      <div className="checklist-scroll-guide__header">
        <h3>Room: {roomTag}</h3>
        <p>Progress: {done} / {total}</p>
      </div>
      <div className="checklist-scroll-guide__categories">
        {categories.map((category: any) => (
          <div key={category.id} className="checklist-scroll-guide__category">
            <h4>{category.name}</h4>
          </div>
        ))}
      </div>
    </div>
  );
}
