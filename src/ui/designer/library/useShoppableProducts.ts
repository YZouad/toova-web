import { useMemo } from 'react';
import { useShoppingCatalogContext } from '../../../context/shoppingCatalogState';
import type {
  ChecklistCategoryWithProducts,
  CuratedProduct,
} from '../../../lib/dormChecklist';

/** Map catalog / builtin kind → first published curated product that places it. */
export function buildShoppableIndex(
  categories: ChecklistCategoryWithProducts[],
): Map<string, CuratedProduct> {
  const map = new Map<string, CuratedProduct>();
  for (const cat of categories) {
    for (const product of cat.products) {
      if (!product.published) continue;
      const keys: string[] = [];
      if (product.placeCatalogKind?.trim()) keys.push(product.placeCatalogKind.trim());
      if (product.placeBuiltinKind?.trim()) keys.push(product.placeBuiltinKind.trim());
      for (const key of keys) {
        if (!map.has(key)) map.set(key, product);
      }
    }
  }
  return map;
}

export function useShoppableProducts() {
  const shopping = useShoppingCatalogContext();
  const byKind = useMemo(
    () => buildShoppableIndex(shopping.categories),
    [shopping.categories],
  );

  return {
    byKind,
    productForKind: (kind: string): CuratedProduct | null => byKind.get(kind) ?? null,
    addToList: shopping.addToList,
    removeFromList: shopping.removeFromList,
    purchaseCartLines: shopping.purchaseCartLines,
    productsById: shopping.productsById,
    ready: shopping.ready,
    moveInBudgetCents: shopping.moveInBudgetCents,
    setMoveInBudget: shopping.setMoveInBudget,
    budgetSummary: shopping.budgetSummary,
  };
}
