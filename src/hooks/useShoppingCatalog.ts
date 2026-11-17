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
  ensureShoppingListCacheVersion,
  loadLocalShoppingList,
  remapCheckedSlugsToIds,
  SHOPPING_LIST_UPDATED_EVENT,
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
import {
  createLocalChecklistProduct,
  loadLocalChecklistProducts,
  mergeLocalProductsIntoCategories,
  upsertLocalChecklistProduct,
} from '../lib/localRoomChecklist';
import {
  createOwnedChecklistProduct,
  isOwnedChecklistProductId,
  loadOwnedChecklistProducts,
  OWNED_CHECKLIST_PRODUCT_PREFIX,
  ownedProductIdForCategory,
  removeOwnedChecklistProduct,
  upsertOwnedChecklistProduct,
  isRoomLocalProductId,
} from '../lib/ownedChecklistItems';
import { isGuestWorkspaceId } from '../lib/guestDesignSnapshot';
import { isStarterEditWorkspaceId } from '../lib/starterTemplateOverrides';
import { trackChecklistItemAdded } from '../lib/analytics';
import { buildPurchaseCartLines, purchaseCartTotalCents } from '../lib/purchaseCart';
import {
  countProductsInRoom,
  reconcileRoomShoppingList,
} from '../lib/reconcileRoomShoppingList';
import { normalizeShoppingListEntry } from '../lib/shoppingListEntry';
import {
  type AgenticManifestResolution,
  type AgenticShoppingManifestEntry,
  loadLocalAgenticShoppingManifest,
  manifestSearchOnlyEntries,
  manifestUnresolvedSearchEntries,
  saveLocalAgenticShoppingManifest,
} from '../lib/agenticShoppingManifest';
import {
  fetchPublishedShoppingCatalog,
  fetchUserAgenticShoppingManifest,
  fetchUserChecklistProgress,
  fetchUserChecklistResolutions,
  fetchUserMoveInBudgetCents,
  fetchUserShoppingList,
  loadRoomShoppingList,
  mergeLocalShoppingStateToAccount,
  removeShoppingListEntry,
  updateAgenticShoppingManifestDismissed,
  upsertChecklistProgress,
  upsertChecklistResolution,
  syncShoppingListEntries,
  upsertShoppingListEntry,
  upsertUserMoveInBudgetCents,
} from '../lib/shoppingCatalog';
import { refreshRoomChecklistFromSavedLayout } from '../lib/roomShoppingListRebuild';
import { useStore } from '../store';
import type { ChecklistLoadMode } from '../context/ChecklistRoomContext';

export function useShoppingCatalog(
  roomId: string | null,
  options?: { checklistLoadMode?: ChecklistLoadMode },
) {
  const checklistLoadMode = options?.checklistLoadMode ?? 'full';
  const listsOnlyLoad = checklistLoadMode === 'lists-only';
  const { user } = useAuth();
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const layoutRoomId = useStore((s) => s.layoutRoomId);
  const persistRoomId = roomId?.trim() || null;
  const canSyncRemote =
    !!user?.id &&
    !!persistRoomId &&
    !isGuestWorkspaceId(persistRoomId) &&
    !isStarterEditWorkspaceId(persistRoomId);

  const [publishedCategories, setPublishedCategories] = useState<
    ChecklistCategoryWithProducts[]
  >([]);
  const [localProducts, setLocalProducts] = useState<CuratedProduct[]>([]);
  const [ownedProducts, setOwnedProducts] = useState<CuratedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [resolutions, setResolutions] = useState<Map<string, CategoryResolution>>(
    () => new Map(),
  );
  const [moveInBudgetCents, setMoveInBudgetCents] = useState<number | null>(null);
  const [list, setList] = useState<ShoppingListEntry[]>([]);
  const [agenticManifest, setAgenticManifest] = useState<AgenticShoppingManifestEntry[]>([]);
  const [ready, setReady] = useState(false);
  const listWriteSeqRef = useRef(0);

  useEffect(() => {
    ensureShoppingListCacheVersion();
  }, []);

  useEffect(() => {
    if (persistRoomId) setActiveChecklistRoomId(persistRoomId);
  }, [persistRoomId]);

  const categories = useMemo(
    () => mergeLocalProductsIntoCategories(publishedCategories, localProducts),
    [publishedCategories, localProducts],
  );

  const productsById = useMemo(() => {
    const map: Record<string, CuratedProduct> = {};
    for (const cat of categories) {
      for (const p of cat.products) map[p.id] = p;
    }
    for (const p of ownedProducts) map[p.id] = p;
    return map;
  }, [categories, ownedProducts]);

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

  const catalogProductIds = useMemo(
    () => new Set(list.map((e) => e.productId)),
    [list],
  );

  const agenticManifestSearchLines = useMemo(
    () => manifestSearchOnlyEntries(agenticManifest, catalogProductIds),
    [agenticManifest, catalogProductIds],
  );

  const agenticManifestCheckoutLines = useMemo(
    () => manifestUnresolvedSearchEntries(agenticManifest, catalogProductIds),
    [agenticManifest, catalogProductIds],
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

  const getOwnedProduct = useCallback(
    (categoryId: string): CuratedProduct | undefined =>
      ownedProducts.find((p) => p.categoryId === categoryId),
    [ownedProducts],
  );

  const getResolution = useCallback(
    (categoryId: string): CategoryResolution | undefined => resolutions.get(categoryId),
    [resolutions],
  );

  const clearOwnedForCategory = useCallback(
    (categoryId: string) => {
      if (!persistRoomId) return;
      const ownedId = ownedProductIdForCategory(categoryId);
      const nextOwned = removeOwnedChecklistProduct(categoryId, persistRoomId);
      setOwnedProducts(nextOwned);
      setList((prev) => {
        if (!prev.some((e) => e.productId === ownedId)) return prev;
        const next = prev.filter((e) => e.productId !== ownedId);
        saveLocalShoppingList(next, persistRoomId);
        return next;
      });
    },
    [persistRoomId],
  );

  const refreshCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cats = await fetchPublishedShoppingCatalog();
      setPublishedCategories(cats);
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

  const refreshListFromStorage = useCallback(async () => {
    if (!persistRoomId) return;
    const writeSeq = listWriteSeqRef.current;
    if (canSyncRemote && user?.id) {
      const merged = await loadRoomShoppingList(user.id, persistRoomId);
      if (writeSeq !== listWriteSeqRef.current) return;
      setList(merged);
      return;
    }
    setList(loadLocalShoppingList(persistRoomId));
  }, [canSyncRemote, persistRoomId, user?.id]);

  useEffect(() => {
    const onListUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ roomId?: string }>).detail;
      if (!persistRoomId || detail?.roomId !== persistRoomId) return;
      void refreshListFromStorage();
    };
    window.addEventListener(SHOPPING_LIST_UPDATED_EVENT, onListUpdated);
    return () => window.removeEventListener(SHOPPING_LIST_UPDATED_EVENT, onListUpdated);
  }, [persistRoomId, refreshListFromStorage]);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  // Load room-scoped checklist state when room or auth changes.
  useEffect(() => {
    let cancelled = false;

    if (!persistRoomId) {
      setChecked(new Set());
      setResolutions(new Map());
      setMoveInBudgetCents(null);
      setList([]);
      setAgenticManifest([]);
      setLocalProducts([]);
      setOwnedProducts([]);
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    if (listsOnlyLoad) {
      setList(loadLocalShoppingList(persistRoomId));
      setReady(true);
      if (!canSyncRemote || !user?.id) {
        return () => {
          cancelled = true;
        };
      }
      void (async () => {
        try {
          const merged = await loadRoomShoppingList(user.id, persistRoomId);
          if (!cancelled) setList(merged);
        } catch {
          if (!cancelled) setList(loadLocalShoppingList(persistRoomId));
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    setReady(false);

    // Drop previous-room list immediately so UI cannot flash stale items.
    setList([]);
    setChecked(new Set());
    setResolutions(new Map());
    setMoveInBudgetCents(null);
    setAgenticManifest([]);
    setLocalProducts([]);
    setOwnedProducts([]);
    setChecklistAreaTagState(null);
    setError(null);

    (async () => {
      if (!canSyncRemote) {
        if (!cancelled) {
          try {
            await refreshRoomChecklistFromSavedLayout(null, persistRoomId);
          } catch (e) {
            console.warn('[toova] guest room checklist refresh', e);
          }
          setChecked(loadCheckedIds(persistRoomId));
          setResolutions(loadLocalResolutions(persistRoomId));
          setMoveInBudgetCents(loadLocalMoveInBudgetCents(persistRoomId));
          setList(loadLocalShoppingList(persistRoomId));
          setAgenticManifest(loadLocalAgenticShoppingManifest(persistRoomId));
          setLocalProducts(loadLocalChecklistProducts(persistRoomId));
          setOwnedProducts(loadOwnedChecklistProducts(persistRoomId));
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
        try {
          await refreshRoomChecklistFromSavedLayout(user!.id, persistRoomId);
        } catch (e) {
          console.warn('[toova] room checklist refresh on load', e);
        }
        const [remoteChecked, remoteList, remoteResolutions, remoteBudget, remoteManifest, remoteAreaTag] =
          await Promise.all([
          fetchUserChecklistProgress(user!.id, persistRoomId),
          loadRoomShoppingList(user!.id, persistRoomId),
          fetchUserChecklistResolutions(user!.id, persistRoomId),
          fetchUserMoveInBudgetCents(user!.id, persistRoomId),
          fetchUserAgenticShoppingManifest(user!.id, persistRoomId),
          fetchUserChecklistRoomAreaTag(user!.id, persistRoomId),
        ]);
        if (cancelled) return;
        const localProductsForRoom = loadLocalChecklistProducts(persistRoomId);
        const ownedProductsForRoom = loadOwnedChecklistProducts(persistRoomId);
        const remoteListWithLocal = remoteList;
        setChecked(remoteChecked);
        saveCheckedIds(remoteChecked, persistRoomId);
        setResolutions(remoteResolutions);
        saveLocalResolutions(remoteResolutions, persistRoomId);
        setMoveInBudgetCents(remoteBudget);
        saveLocalMoveInBudgetCents(remoteBudget, persistRoomId);
        setList(remoteListWithLocal);
        saveLocalShoppingList(remoteListWithLocal, persistRoomId);
        const localManifest = loadLocalAgenticShoppingManifest(persistRoomId);
        const mergedManifest = localManifest.length > 0 ? localManifest : remoteManifest;
        setAgenticManifest(mergedManifest);
        saveLocalAgenticShoppingManifest(persistRoomId, mergedManifest);
        setLocalProducts(localProductsForRoom);
        setOwnedProducts(ownedProductsForRoom);
        const localAreaTag = loadLocalChecklistAreaTag(persistRoomId);
        const mergedAreaTag = remoteAreaTag ?? localAreaTag;
        setChecklistAreaTagState(mergedAreaTag);
        saveLocalChecklistAreaTag(persistRoomId, mergedAreaTag);
        if (remoteAreaTag == null && localAreaTag) {
          void upsertUserChecklistRoomAreaTag(user!.id, persistRoomId, localAreaTag).catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setChecked(loadCheckedIds(persistRoomId));
          setResolutions(loadLocalResolutions(persistRoomId));
          setMoveInBudgetCents(loadLocalMoveInBudgetCents(persistRoomId));
          setList(loadLocalShoppingList(persistRoomId));
          setAgenticManifest(loadLocalAgenticShoppingManifest(persistRoomId));
          setLocalProducts(loadLocalChecklistProducts(persistRoomId));
          setOwnedProducts(loadOwnedChecklistProducts(persistRoomId));
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, persistRoomId, canSyncRemote, listsOnlyLoad]);

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
      if (resolution == null) {
        clearOwnedForCategory(categoryId);
      }
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
    [canSyncRemote, clearOwnedForCategory, placedCategoryIds, persistRoomId, user],
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

  const persistListChange = useCallback(
    async (next: ShoppingListEntry[], prev: ShoppingListEntry[]) => {
      listWriteSeqRef.current += 1;
      saveLocalShoppingList(next, persistRoomId);
      if (!canSyncRemote || !user?.id) return;
      try {
        await syncShoppingListEntries(user.id, persistRoomId!, next, prev);
      } catch (e) {
        setList(prev);
        saveLocalShoppingList(prev, persistRoomId);
        setError(e instanceof Error ? e.message : 'Failed to save checklist');
        throw e;
      }
    },
    [canSyncRemote, persistRoomId, user?.id],
  );

  const addToList = useCallback(
    async (productId: string, quantity = 1) => {
      if (!persistRoomId) return;
      const qty = Math.max(1, Math.floor(quantity));
      const prevSnapshot = list;
      const isNewEntry = !list.some((e) => e.productId === productId);
      if (isNewEntry) {
        const product = productsById[productId];
        trackChecklistItemAdded({
          room_id: persistRoomId,
          product_id: productId,
          category: (product ? categoriesById[product.categoryId]?.slug : undefined) ?? 'unknown',
          is_curated: true,
        });
      }
      const existing = prevSnapshot.find((e) => e.productId === productId);
      const next = existing
        ? prevSnapshot.map((e) =>
            e.productId === productId
              ? normalizeShoppingListEntry({
                  ...e,
                  manualQuantity: Math.max(e.manualQuantity, qty),
                })
              : e,
          )
        : [
            ...prevSnapshot,
            normalizeShoppingListEntry({
              productId,
              manualQuantity: qty,
              roomQuantity: 0,
              reviewDone: false,
            }),
          ];
      setList(next);
      await persistListChange(next, prevSnapshot);
    },
    [canSyncRemote, categoriesById, list, persistRoomId, persistListChange, productsById],
  );

  const setQuantity = useCallback(
    async (productId: string, quantity: number) => {
      if (!persistRoomId) return;
      const qty = Math.max(1, Math.floor(quantity));
      const prevSnapshot = list;
      const next = prevSnapshot.map((e) => {
        if (e.productId !== productId) return e;
        const manualQuantity = Math.max(e.roomQuantity, qty);
        return normalizeShoppingListEntry({ ...e, manualQuantity });
      });
      setList(next);
      await persistListChange(next, prevSnapshot);
    },
    [list, persistRoomId, persistListChange],
  );

  const removeFromList = useCallback(
    async (productId: string) => {
      if (!persistRoomId) return;
      if (isOwnedChecklistProductId(productId)) {
        const categoryId = productId.slice(OWNED_CHECKLIST_PRODUCT_PREFIX.length);
        await setResolution(categoryId, null);
        return;
      }
      const prevSnapshot = list;
      const existing = prevSnapshot.find((e) => e.productId === productId);
      if (!existing) return;
      const next =
        existing.roomQuantity > 0
          ? prevSnapshot.map((e) =>
              e.productId === productId
                ? normalizeShoppingListEntry({ ...e, manualQuantity: 0 })
                : e,
            )
          : prevSnapshot.filter((e) => e.productId !== productId);
      setList(next);
      await persistListChange(next, prevSnapshot);
    },
    [list, persistRoomId, persistListChange, setResolution],
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
          clearOwnedForCategory(catId);
          if (canSyncRemote) {
            void upsertChecklistResolution(user!.id, persistRoomId, catId, null).catch(() => {});
          }
        }
      }
      if (!changed) return prev;
      saveLocalResolutions(next, persistRoomId);
      return next;
    });
  }, [ready, placedCategoryIds, canSyncRemote, persistRoomId, user, clearOwnedForCategory]);

  // Room-derived quantities follow placements when store matches this checklist room.
  useEffect(() => {
    if (!ready || !persistRoomId || layoutRoomId !== persistRoomId) return;
    const roomCounts = countProductsInRoom({ categories, items, order, productsById });
    setList((prevSnapshot) => {
      const next = reconcileRoomShoppingList({ roomCounts, current: prevSnapshot });
      const unchanged =
        next.length === prevSnapshot.length &&
        next.every((row) => {
          const prev = prevSnapshot.find((e) => e.productId === row.productId);
          if (!prev) return false;
          return (
            prev.roomQuantity === row.roomQuantity &&
            prev.manualQuantity === row.manualQuantity &&
            prev.reviewDone === row.reviewDone
          );
        });
      if (unchanged) return prevSnapshot;
      void persistListChange(next, prevSnapshot);
      return next;
    });
  }, [ready, persistRoomId, layoutRoomId, categories, items, order, productsById, persistListChange]);

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
        if (canSyncRemote && entry && !isRoomLocalProductId(productId)) {
          void upsertShoppingListEntry(user!.id, persistRoomId, entry).catch(() => {});
        }
        return next;
      });
    },
    [canSyncRemote, persistRoomId, user],
  );

  const addImportedModelToChecklist = useCallback(
    async (input: {
      name: string;
      description?: string;
      affiliateUrl: string;
      priceCents: number | null;
      catalogKind: string;
      imageUrl?: string | null;
    }) => {
      if (!persistRoomId) return null;
      const product = createLocalChecklistProduct(input);
      const next = upsertLocalChecklistProduct(product, persistRoomId);
      setLocalProducts(next);
      await addToList(product.id);
      return product;
    },
    [addToList, persistRoomId],
  );

  const dismissAgenticManifestEntry = useCallback(
    async (entryId: string) => {
      if (!persistRoomId) return;
      setAgenticManifest((prev) => {
        const next = prev.map((e) => (e.id === entryId ? { ...e, dismissed: true } : e));
        saveLocalAgenticShoppingManifest(persistRoomId, next);
        return next;
      });
      if (canSyncRemote) {
        await updateAgenticShoppingManifestDismissed(user!.id, persistRoomId, entryId, true);
      }
    },
    [canSyncRemote, persistRoomId, user],
  );

  const setAgenticManifestResolution = useCallback(
    async (entryId: string, resolution: AgenticManifestResolution | null) => {
      if (!persistRoomId) return;
      setAgenticManifest((prev) => {
        const next = prev.map((e) =>
          e.id === entryId
            ? {
                ...e,
                resolution,
                dismissed: resolution === 'skip' ? true : e.dismissed,
              }
            : e,
        );
        saveLocalAgenticShoppingManifest(persistRoomId, next);
        return next;
      });
      if (canSyncRemote && resolution === 'skip') {
        await updateAgenticShoppingManifestDismissed(user!.id, persistRoomId, entryId, true);
      }
    },
    [canSyncRemote, persistRoomId, user],
  );

  const markCategoryAsOwned = useCallback(
    async (input: {
      categoryId: string;
      name: string;
      affiliateUrl: string;
      priceCents: number;
    }) => {
      if (!persistRoomId) return null;
      const product = createOwnedChecklistProduct(input);
      const nextOwned = upsertOwnedChecklistProduct(product, persistRoomId);
      setOwnedProducts(nextOwned);
      await addToList(product.id);
      await setResolution(input.categoryId, 'have');
      return product;
    },
    [addToList, persistRoomId, setResolution],
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
    getOwnedProduct,
    setResolution,
    markCategoryAsOwned,
    moveInBudgetCents,
    setMoveInBudget,
    spentCents,
    budgetSummary,
    purchaseCartLines,
    agenticManifest,
    agenticManifestSearchLines,
    agenticManifestCheckoutLines,
    dismissAgenticManifestEntry,
    setAgenticManifestResolution,
    list,
    toggleChecked,
    addToList,
    addImportedModelToChecklist,
    setQuantity,
    removeFromList,
    markReviewDone,
    refreshCatalog,
    refreshListFromStorage,
    checklistAreaTag,
    setChecklistAreaTag,
  };
}

export type ShoppingCatalogApi = ReturnType<typeof useShoppingCatalog>;
