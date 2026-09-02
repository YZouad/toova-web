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
  setActiveChecklistRoomId,
  type CategoryResolution,
  type ChecklistCategoryWithProducts,
  type CuratedProduct,
  type ShoppingListEntry,
} from '../lib/dormChecklist';
import { isGuestWorkspaceId } from '../lib/guestDesignSnapshot';
import { buildPurchaseCartLines, purchaseCartTotalCents } from '../lib/purchaseCart';
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

export function useShoppingCatalog(roomId: string | null) {
  const { user } = useAuth();
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const persistRoomId = roomId?.trim() || null;
  const canSyncRemote =
    !!user?.id && !!persistRoomId && !isGuestWorkspaceId(persistRoomId);

  const [categories, setCategories] = useState<ChecklistCategoryWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [resolutions, setResolutions] = useState<Map<string, CategoryResolution>>(
    () => new Map(),
  );
  const [moveInBudgetCents, setMoveInBudgetCents] = useState<number | null>(null);
  const [list, setList] = useState<ShoppingListEntry[]>([]);
  const [ready, setReady] = useState(false);
  /** Previous curated product IDs present in the room; used to drop To Buy on delete. */
  const prevRoomProductIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (persistRoomId) setActiveChecklistRoomId(persistRoomId);
  }, [persistRoomId]);

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

  const spentCents = useMemo(
    () => purchaseCartTotalCents(purchaseCartLines).sum,
    [purchaseCartLines],
  );

  const budgetSummary = useMemo(
    () => computeChecklistBudgetSummary(moveInBudgetCents, spentCents),
    [moveInBudgetCents, spentCents],
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
        saveCheckedIds(remapped, persistRoomId);
        return remapped;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load checklist');
    } finally {
      setLoading(false);
    }
  }, [persistRoomId]);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  // Load room-scoped checklist state when room or auth changes.
  useEffect(() => {
    let cancelled = false;
    prevRoomProductIdsRef.current = null;
    setReady(false);

    if (!persistRoomId) {
      setChecked(new Set());
      setResolutions(new Map());
      setMoveInBudgetCents(null);
      setList([]);
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      if (!canSyncRemote) {
        if (!cancelled) {
          setChecked(loadCheckedIds(persistRoomId));
          setResolutions(loadLocalResolutions(persistRoomId));
          setMoveInBudgetCents(loadLocalMoveInBudgetCents(persistRoomId));
          setList(loadLocalShoppingList(persistRoomId));
          setReady(true);
        }
        return;
      }

      try {
        const mergedKey = `${CHECKLIST_PROGRESS_MERGED_KEY}:${user!.id}:${persistRoomId}`;
        if (!sessionStorage.getItem(mergedKey)) {
          await mergeLocalShoppingStateToAccount(user!.id, persistRoomId);
          sessionStorage.setItem(mergedKey, '1');
        }
        const [remoteChecked, remoteList, remoteResolutions, remoteBudget] = await Promise.all([
          fetchUserChecklistProgress(user!.id, persistRoomId),
          fetchUserShoppingList(user!.id, persistRoomId),
          fetchUserChecklistResolutions(user!.id, persistRoomId),
          fetchUserMoveInBudgetCents(user!.id, persistRoomId),
        ]);
        if (cancelled) return;
        setChecked(remoteChecked);
        saveCheckedIds(remoteChecked, persistRoomId);
        setResolutions(remoteResolutions);
        saveLocalResolutions(remoteResolutions, persistRoomId);
        setMoveInBudgetCents(remoteBudget);
        saveLocalMoveInBudgetCents(remoteBudget, persistRoomId);
        setList(remoteList);
        saveLocalShoppingList(remoteList, persistRoomId);
      } catch {
        if (!cancelled) {
          setChecked(loadCheckedIds(persistRoomId));
          setResolutions(loadLocalResolutions(persistRoomId));
          setMoveInBudgetCents(loadLocalMoveInBudgetCents(persistRoomId));
          setList(loadLocalShoppingList(persistRoomId));
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, persistRoomId, canSyncRemote]);

  const setCategoryChecked = useCallback(
    async (categoryId: string, isChecked: boolean) => {
      if (!persistRoomId) return;
      setChecked((prev) => {
        const already = prev.has(categoryId);
        if (already === isChecked) return prev;
        const next = new Set(prev);
        if (isChecked) next.add(categoryId);
        else next.delete(categoryId);
        saveCheckedIds(next, persistRoomId);
        if (canSyncRemote) {
          void upsertChecklistProgress(user!.id, persistRoomId, categoryId, isChecked).catch(
            () => {
              /* keep local */
            },
          );
        }
        return next;
      });
    },
    [canSyncRemote, persistRoomId, user],
  );

  const setResolution = useCallback(
    async (categoryId: string, resolution: CategoryResolution | null) => {
      if (!persistRoomId) return;
      if (placedCategoryIds.has(categoryId) && resolution != null) return;
      setResolutions((prev) => {
        const current = prev.get(categoryId);
        if (current === resolution || (current == null && resolution == null)) return prev;
        const next = new Map(prev);
        if (resolution == null) next.delete(categoryId);
        else next.set(categoryId, resolution);
        saveLocalResolutions(next, persistRoomId);
        if (canSyncRemote) {
          void upsertChecklistResolution(user!.id, persistRoomId, categoryId, resolution).catch(
            () => {},
          );
        }
        return next;
      });
    },
    [canSyncRemote, placedCategoryIds, persistRoomId, user],
  );

  const setMoveInBudget = useCallback(
    async (budgetCents: number | null) => {
      if (!persistRoomId) return;
      const normalized =
        budgetCents == null ? null : Math.max(0, Math.round(budgetCents));
      setMoveInBudgetCents(normalized);
      saveLocalMoveInBudgetCents(normalized, persistRoomId);
      if (canSyncRemote) {
        void upsertUserMoveInBudgetCents(user!.id, persistRoomId, normalized).catch(() => {});
      }
    },
    [canSyncRemote, persistRoomId, user],
  );

  const addToList = useCallback(
    async (productId: string, quantity = 1) => {
      if (!persistRoomId) return;
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
        saveLocalShoppingList(next, persistRoomId);
        const entry = next.find((e) => e.productId === productId)!;
        if (canSyncRemote) {
          void upsertShoppingListEntry(user!.id, persistRoomId, entry).catch(() => {});
        }
        return next;
      });
    },
    [canSyncRemote, persistRoomId, user],
  );

  const setQuantity = useCallback(
    async (productId: string, quantity: number) => {
      if (!persistRoomId) return;
      const qty = Math.max(1, Math.floor(quantity));
      setList((prev) => {
        const next = prev.map((e) =>
          e.productId === productId ? { ...e, quantity: qty } : e,
        );
        saveLocalShoppingList(next, persistRoomId);
        const entry = next.find((e) => e.productId === productId);
        if (canSyncRemote && entry) {
          void upsertShoppingListEntry(user!.id, persistRoomId, entry).catch(() => {});
        }
        return next;
      });
    },
    [canSyncRemote, persistRoomId, user],
  );

  const removeFromList = useCallback(
    async (productId: string) => {
      if (!persistRoomId) return;
      setList((prev) => {
        const next = prev.filter((e) => e.productId !== productId);
        saveLocalShoppingList(next, persistRoomId);
        return next;
      });
      if (canSyncRemote) {
        void removeShoppingListEntry(user!.id, persistRoomId, productId).catch(() => {});
      }
    },
    [canSyncRemote, persistRoomId, user],
  );

  const toggleChecked = useCallback(
    async (categoryId: string) => {
      if (!persistRoomId) return;
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
        saveCheckedIds(next, persistRoomId);
        if (canSyncRemote) {
          void upsertChecklistProgress(user!.id, persistRoomId, categoryId, willCheck).catch(
            () => {
              /* keep local */
            },
          );
        }
        return next;
      });
    },
    [
      addToList,
      canSyncRemote,
      categoriesById,
      list,
      persistRoomId,
      removeFromList,
      satisfiedCategoryIds,
      setCategoryChecked,
      user,
    ],
  );

  // Placing in room clears have/skip for that category.
  useEffect(() => {
    if (!ready || !persistRoomId) return;
    setResolutions((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const catId of placedCategoryIds) {
        if (next.has(catId)) {
          next.delete(catId);
          changed = true;
          if (canSyncRemote) {
            void upsertChecklistResolution(user!.id, persistRoomId, catId, null).catch(() => {});
          }
        }
      }
      if (!changed) return prev;
      saveLocalResolutions(next, persistRoomId);
      return next;
    });
  }, [ready, placedCategoryIds, canSyncRemote, persistRoomId, user]);

  // When the last room copy of a curated product is deleted, drop it from To Buy.
  useEffect(() => {
    if (!ready || !persistRoomId) return;
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
  }, [ready, items, order, persistRoomId, removeFromList]);

  // Drop stale persisted checks for purchasable categories not in To Buy.
  useEffect(() => {
    if (!ready || !persistRoomId || categories.length === 0) return;
    for (const cat of categories) {
      if (!categoryHasPurchasableProducts(cat)) continue;
      if (checked.has(cat.id) && !satisfiedCategoryIds.has(cat.id)) {
        void setCategoryChecked(cat.id, false);
      }
    }
  }, [
    ready,
    persistRoomId,
    categories,
    checked,
    satisfiedCategoryIds,
    setCategoryChecked,
  ]);

  const markReviewDone = useCallback(
    async (productId: string, done: boolean) => {
      if (!persistRoomId) return;
      setList((prev) => {
        const next = prev.map((e) =>
          e.productId === productId ? { ...e, reviewDone: done } : e,
        );
        saveLocalShoppingList(next, persistRoomId);
        const entry = next.find((e) => e.productId === productId);
        if (canSyncRemote && entry) {
          void upsertShoppingListEntry(user!.id, persistRoomId, entry).catch(() => {});
        }
        return next;
      });
    },
    [canSyncRemote, persistRoomId, user],
  );

  return {
    roomId: persistRoomId,
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
