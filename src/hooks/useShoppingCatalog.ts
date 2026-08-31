import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import {
  CHECKLIST_PROGRESS_MERGED_KEY,
  categoryHasPurchasableProducts,
  categoryIdsSatisfiedByPurchases,
  loadCheckedIds,
  loadLocalShoppingList,
  remapCheckedSlugsToIds,
  saveCheckedIds,
  saveLocalShoppingList,
  type ChecklistCategoryWithProducts,
  type CuratedProduct,
  type ShoppingListEntry,
} from '../lib/dormChecklist';
import {
  fetchPublishedShoppingCatalog,
  fetchUserChecklistProgress,
  fetchUserShoppingList,
  mergeLocalShoppingStateToAccount,
  removeShoppingListEntry,
  upsertChecklistProgress,
  upsertShoppingListEntry,
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

  const satisfiedCategoryIds = useMemo(() => {
    const placements = order
      .map((id) => items[id])
      .filter((item): item is NonNullable<typeof item> => item != null)
      .map((item) => ({
        kind: item.kind,
        curatedProductId: item.curatedProductId,
      }));
    return categoryIdsSatisfiedByPurchases(
      categories,
      placements,
      list.map((e) => e.productId),
    );
  }, [categories, items, order, list]);

  /**
   * Checklist rows with curated products follow To Buy / room coverage only.
   * Sticky saved checks are ignored so removing a list item unchecks immediately.
   */
  const isCategoryDone = useCallback(
    (categoryId: string) => {
      if (satisfiedCategoryIds.has(categoryId)) return true;
      const cat = categoriesById[categoryId];
      if (cat && categoryHasPurchasableProducts(cat)) return false;
      return checked.has(categoryId);
    },
    [satisfiedCategoryIds, categoriesById, checked],
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
        const [remoteChecked, remoteList] = await Promise.all([
          fetchUserChecklistProgress(user.id),
          fetchUserShoppingList(user.id),
        ]);
        if (cancelled) return;
        setChecked(remoteChecked);
        saveCheckedIds(remoteChecked);
        setList(remoteList);
        saveLocalShoppingList(remoteList);
      } catch {
        if (!cancelled) {
          setChecked(loadCheckedIds());
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
          // Uncheck = remove this category's products from To Buy.
          for (const product of cat.products) {
            if (list.some((e) => e.productId === product.id)) {
              void removeFromList(product.id);
            }
          }
          void setCategoryChecked(categoryId, false);
          return;
        }
        // Check = add the first curated pick to To Buy.
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
    satisfiedCategoryIds,
    isCategoryDone,
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
