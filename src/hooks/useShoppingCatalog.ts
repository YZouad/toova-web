import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import {
  CHECKLIST_PROGRESS_MERGED_KEY,
  categoryHasPurchasableProducts,
  categoryIdsSatisfiedByPlacements,
  categoryIdsSatisfiedByPurchases,
  computeChecklistBudgetSummary,
  loadCheckedIds,
  loadLocalMoveInBudgetCents,
  loadLocalResolutions,
  loadLocalShoppingList,
  remapCheckedSlugsToIds,
  roomItemsToPlacementRefs,
  saveCheckedIds,
  saveLocalMoveInBudgetCents,
  saveLocalResolutions,
  saveLocalShoppingList,
  spentCentsForRoom,
  type CategoryResolution,
  type ChecklistCategoryWithProducts,
  type CuratedProduct,
  type ShoppingListEntry,
} from '../lib/dormChecklist';
import { buildPurchaseCartLines } from '../lib/purchaseCart';
import {
  fetchPublishedShoppingCatalog,
  fetchUserChecklistProgress,
  fetchUserChecklistResolutions,
  fetchUserMoveInBudgetCents,
  fetchUserShoppingList,
  mergeLocalShoppingStateToAccount,
  removeShoppingListEntry,
  upsertChecklistProgress,
  upsertChecklistResolution,
  upsertShoppingListEntry,
  upsertUserMoveInBudgetCents,
} from '../lib/shoppingCatalog';
import { useStore } from '../store';

export function useShoppingCatalog() {
  const { user } = useAuth();
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const [categories, setCategories] = useState<ChecklistCategoryWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(() => loadCheckedIds());
  const [resolutions, setResolutions] = useState<Map<string, CategoryResolution>>(
    () => loadLocalResolutions(),
  );
  const [moveInBudgetCents, setMoveInBudgetCents] = useState<number | null>(() =>
    loadLocalMoveInBudgetCents(),
  );
  const [list, setList] = useState<ShoppingListEntry[]>(() => loadLocalShoppingList());
  const [ready, setReady] = useState(false);
  /** Previous curated product IDs present in the room; used to drop To Buy on delete. */
  const prevRoomProductIdsRef = useRef<Set<string> | null>(null);

  const productsById = useMemo(() => {
    const map: Record<string, CuratedProduct> = {};
    for (const cat of categories) {
      for (const p of cat.products) map[p.id] = p;
    }
    return map;
  }, [categories]);

  const categoriesById = useMemo(() => {
    const map: Record<string, ChecklistCategoryWithProducts> = {};
    for (const cat of categories) map[cat.id] = cat;
    return map;
  }, [categories]);

  const placedCategoryIds = useMemo(
    () =>
      categoryIdsSatisfiedByPlacements(categories, roomItemsToPlacementRefs(items, order)),
    [categories, items, order],
  );

  const satisfiedCategoryIds = useMemo(() => {
    return categoryIdsSatisfiedByPurchases(
      categories,
      roomItemsToPlacementRefs(items, order),
      list.map((e) => e.productId),
    );
  }, [categories, items, order, list]);

  const spentCents = useMemo(
    () => spentCentsForRoom(categories, items, order, productsById),
    [categories, items, order, productsById],
  );

  const budgetSummary = useMemo(
    () => computeChecklistBudgetSummary(moveInBudgetCents, spentCents),
    [moveInBudgetCents, spentCents],
  );

  const purchaseCartLines = useMemo(
    () =>
      buildPurchaseCartLines({
        categories,
        items,
        order,
        list,
        productsById,
        getResolution: (categoryId) => resolutions.get(categoryId),
      }),
    [categories, items, order, list, productsById, resolutions],
  );

  /**
   * Checklist rows with curated products follow room / resolution coverage.
   * Sticky saved checks are ignored so removing a list item unchecks immediately.
   */
  const isCategoryDone = useCallback(
    (categoryId: string) => {
      if (placedCategoryIds.has(categoryId)) return true;
      const resolution = resolutions.get(categoryId);
      if (resolution === 'have' || resolution === 'skip') return true;
      const cat = categoriesById[categoryId];
      if (cat && categoryHasPurchasableProducts(cat)) return false;
      return checked.has(categoryId);
    },
    [placedCategoryIds, resolutions, categoriesById, checked],
  );

  const getResolution = useCallback(
    (categoryId: string): CategoryResolution | undefined => resolutions.get(categoryId),
    [resolutions],
  );

  const refreshCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cats = await fetchPublishedShoppingCatalog();
      setCategories(cats);
      setChecked((prev) => {
        const remapped = remapCheckedSlugsToIds(prev, cats);
        saveCheckedIds(remapped);
        return remapped;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load checklist');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  // Sync progress / list when auth changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        if (!cancelled) {
          setChecked(loadCheckedIds());
          setResolutions(loadLocalResolutions());
          setMoveInBudgetCents(loadLocalMoveInBudgetCents());
          setList(loadLocalShoppingList());
          setReady(true);
        }
        return;
      }
      try {
        const mergedKey = `${CHECKLIST_PROGRESS_MERGED_KEY}:${user.id}`;
        if (!sessionStorage.getItem(mergedKey)) {
          await mergeLocalShoppingStateToAccount(user.id);
          sessionStorage.setItem(mergedKey, '1');
        }
        const [remoteChecked, remoteList, remoteResolutions, remoteBudget] = await Promise.all([
          fetchUserChecklistProgress(user.id),
          fetchUserShoppingList(user.id),
          fetchUserChecklistResolutions(user.id),
          fetchUserMoveInBudgetCents(user.id),
        ]);
        if (cancelled) return;
        setChecked(remoteChecked);
        saveCheckedIds(remoteChecked);
        setResolutions(remoteResolutions);
        saveLocalResolutions(remoteResolutions);
        setMoveInBudgetCents(remoteBudget);
        saveLocalMoveInBudgetCents(remoteBudget);
        setList(remoteList);
        saveLocalShoppingList(remoteList);
      } catch {
        if (!cancelled) {
          setChecked(loadCheckedIds());
          setResolutions(loadLocalResolutions());
          setMoveInBudgetCents(loadLocalMoveInBudgetCents());
          setList(loadLocalShoppingList());
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const setCategoryChecked = useCallback(
    async (categoryId: string, isChecked: boolean) => {
      setChecked((prev) => {
        const already = prev.has(categoryId);
        if (already === isChecked) return prev;
        const next = new Set(prev);
        if (isChecked) next.add(categoryId);
        else next.delete(categoryId);
        saveCheckedIds(next);
        if (user?.id) {
          void upsertChecklistProgress(user.id, categoryId, isChecked).catch(() => {
            /* keep local */
          });
        }
        return next;
      });
    },
    [user?.id],
  );

  const setResolution = useCallback(
    async (categoryId: string, resolution: CategoryResolution | null) => {
      if (placedCategoryIds.has(categoryId) && resolution != null) return;
      setResolutions((prev) => {
        const current = prev.get(categoryId);
        if (current === resolution || (current == null && resolution == null)) return prev;
        const next = new Map(prev);
        if (resolution == null) next.delete(categoryId);
        else next.set(categoryId, resolution);
        saveLocalResolutions(next);
        if (user?.id) {
          void upsertChecklistResolution(user.id, categoryId, resolution).catch(() => {});
        }
        return next;
      });
    },
    [placedCategoryIds, user?.id],
  );

  const setMoveInBudget = useCallback(
    async (budgetCents: number | null) => {
      const normalized =
        budgetCents == null ? null : Math.max(0, Math.round(budgetCents));
      setMoveInBudgetCents(normalized);
      saveLocalMoveInBudgetCents(normalized);
      if (user?.id) {
        void upsertUserMoveInBudgetCents(user.id, normalized).catch(() => {});
      }
    },
    [user?.id],
  );

  const addToList = useCallback(
    async (productId: string, quantity = 1) => {
      setList((prev) => {
        const existing = prev.find((e) => e.productId === productId);
        let next: ShoppingListEntry[];
        if (existing) {
          next = prev.map((e) =>
            e.productId === productId
              ? { ...e, quantity: Math.max(e.quantity, quantity) }
              : e,
          );
        } else {
          next = [...prev, { productId, quantity, reviewDone: false }];
        }
        saveLocalShoppingList(next);
        const entry = next.find((e) => e.productId === productId)!;
        if (user?.id) {
          void upsertShoppingListEntry(user.id, entry).catch(() => {});
        }
        return next;
      });
    },
    [user?.id],
  );

  const setQuantity = useCallback(
    async (productId: string, quantity: number) => {
      const qty = Math.max(1, Math.floor(quantity));
      setList((prev) => {
        const next = prev.map((e) =>
          e.productId === productId ? { ...e, quantity: qty } : e,
        );
        saveLocalShoppingList(next);
        const entry = next.find((e) => e.productId === productId);
        if (user?.id && entry) {
          void upsertShoppingListEntry(user.id, entry).catch(() => {});
        }
        return next;
      });
    },
    [user?.id],
  );

  const removeFromList = useCallback(
    async (productId: string) => {
      setList((prev) => {
        const next = prev.filter((e) => e.productId !== productId);
        saveLocalShoppingList(next);
        return next;
      });
      if (user?.id) {
        void removeShoppingListEntry(user.id, productId).catch(() => {});
      }
    },
    [user?.id],
  );

  const toggleChecked = useCallback(
    async (categoryId: string) => {
      const cat = categoriesById[categoryId];
      if (cat && categoryHasPurchasableProducts(cat)) {
        if (satisfiedCategoryIds.has(categoryId)) {
          for (const product of cat.products) {
            if (list.some((e) => e.productId === product.id)) {
              void removeFromList(product.id);
            }
          }
          void setCategoryChecked(categoryId, false);
          return;
        }
        const first = cat.products[0];
        if (first) void addToList(first.id);
        return;
      }

      setChecked((prev) => {
        const willCheck = !prev.has(categoryId);
        const next = new Set(prev);
        if (willCheck) next.add(categoryId);
        else next.delete(categoryId);
        saveCheckedIds(next);
        if (user?.id) {
          void upsertChecklistProgress(user.id, categoryId, willCheck).catch(() => {
            /* keep local */
          });
        }
        return next;
      });
    },
    [
      categoriesById,
      satisfiedCategoryIds,
      list,
      removeFromList,
      addToList,
      setCategoryChecked,
      user?.id,
    ],
  );

  // Placing in room clears have/skip for that category.
  useEffect(() => {
    if (!ready) return;
    setResolutions((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const catId of placedCategoryIds) {
        if (next.has(catId)) {
          next.delete(catId);
          changed = true;
          if (user?.id) {
            void upsertChecklistResolution(user.id, catId, null).catch(() => {});
          }
        }
      }
      if (!changed) return prev;
      saveLocalResolutions(next);
      return next;
    });
  }, [ready, placedCategoryIds, user?.id]);

  // When the last room copy of a curated product is deleted, drop it from To Buy.
  useEffect(() => {
    if (!ready) return;
    const current = new Set<string>();
    for (const id of order) {
      const item = items[id];
      if (item?.curatedProductId) current.add(item.curatedProductId);
    }
    const prev = prevRoomProductIdsRef.current;
    prevRoomProductIdsRef.current = current;
    if (!prev) return;
    for (const productId of prev) {
      if (!current.has(productId)) {
        void removeFromList(productId);
      }
    }
  }, [ready, items, order, removeFromList]);

  // Drop stale persisted checks for purchasable categories not in To Buy.
  useEffect(() => {
    if (!ready || categories.length === 0) return;
    for (const cat of categories) {
      if (!categoryHasPurchasableProducts(cat)) continue;
      if (checked.has(cat.id) && !satisfiedCategoryIds.has(cat.id)) {
        void setCategoryChecked(cat.id, false);
      }
    }
  }, [ready, categories, checked, satisfiedCategoryIds, setCategoryChecked]);

  const markReviewDone = useCallback(
    async (productId: string, done: boolean) => {
      setList((prev) => {
        const next = prev.map((e) =>
          e.productId === productId ? { ...e, reviewDone: done } : e,
        );
        saveLocalShoppingList(next);
        const entry = next.find((e) => e.productId === productId);
        if (user?.id && entry) {
          void upsertShoppingListEntry(user.id, entry).catch(() => {});
        }
        return next;
      });
    },
    [user?.id],
  );

  return {
    categories,
    categoriesById,
    productsById,
    loading,
    error,
    ready,
    checked,
    resolutions,
    placedCategoryIds,
    satisfiedCategoryIds,
    isCategoryDone,
    getResolution,
    setResolution,
    moveInBudgetCents,
    setMoveInBudget,
    spentCents,
    budgetSummary,
    purchaseCartLines,
    list,
    toggleChecked,
    addToList,
    setQuantity,
    removeFromList,
    markReviewDone,
    refreshCatalog,
  };
}

export type ShoppingCatalogApi = ReturnType<typeof useShoppingCatalog>;
