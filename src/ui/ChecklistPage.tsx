import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChecklistCategoryWithProducts, CuratedProduct } from '../lib/dormChecklist';
import {
  categoryCoverImageUrl,
  categoryProductCount,
  checklistLineStatus,
  childCategories,
  leafCategories,
  topLevelCategories,
} from '../lib/dormChecklist';
import { useShoppingCatalogContext } from '../context/ShoppingCatalogContext';
import { useAuth } from '../hooks/useAuth';
import { fetchAdminShoppingCatalog } from '../lib/shoppingCatalog';
import { deleteCuratedProduct } from '../lib/shoppingCatalogAdmin';
import { ProductDrawer } from './ProductDrawer';
import { ChecklistProductModal } from './ChecklistProductModal';
import { ChecklistCategoryModal } from './ChecklistCategoryModal';
import { placeCuratedProduct, startChecklistDrawPlacement } from '../lib/placeCuratedProduct';
import { getProductDrawKind } from '../lib/dormChecklist';
import {
  Banner,
  Button,
  Eyebrow,
  Logo,
  MonoMeta,
  SectionOpener,
  SiteFooter,
  Spinner,
} from './kit';
import { FeedbackModal } from './FeedbackModal';
import { BundleCards } from './billing/BundleCards';
import { ChecklistAdminPanel } from './ChecklistAdminPanel';
import { ChecklistCheckoutPanel } from './ChecklistCheckoutPanel';
import { ChecklistScrollGuide } from './checklist/ChecklistScrollGuide';
import { AddToListModal } from './checklist/AddToListModal';
import { ChecklistAddedToast } from './checklist/ChecklistAddedToast';
import { ChecklistRoomLoadPanel } from './checklist/ChecklistRoomLoadPanel';
import { ImportModelModal } from './ImportModelModal';
import type { ChecklistInspoClip } from '../lib/inspoClipUrls';

interface ChecklistPageProps {
  onBack: () => void;
  onDesign?: () => void;
  /** When true, Place actions are available (designer workspace active). */
  canPlace?: boolean;
  isAdmin?: boolean;
  onContact?: () => void;
  onPitchMadness?: () => void;
  onAdmin?: () => void;
  onRequestSignIn?: () => void;
  onOpenLists?: () => void;
  /** List the user opened from (Your checklists) or last picked add target. */
  preferredListId?: string | null;
}

export function ChecklistPage({
  onBack,
  onDesign,
  canPlace = false,
  isAdmin = false,
  onContact,
  onPitchMadness,
  onAdmin,
  onRequestSignIn,
  onOpenLists,
  preferredListId = null,
}: ChecklistPageProps) {
  const {
    roomId: checklistRoomId,
    categories,
    productsById,
    loading,
    ready,
    error,
    isCategoryDone,
    addToList,
    refreshCatalog,
    refreshListFromStorage,
    list,
    budgetSummary,
    setMoveInBudget,
    getResolution,
    setResolution,
    getOwnedProduct,
    markCategoryAsOwned,
    purchaseCartLines,
    removeFromList,
    placedCategoryIds,
  } = useShoppingCatalogContext();
  const { user } = useAuth();
  const [browseCategories, setBrowseCategories] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [adminCategories, setAdminCategories] = useState<ChecklistCategoryWithProducts[]>([]);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CuratedProduct | null>(null);
  const [addToListProduct, setAddToListProduct] = useState<CuratedProduct | null>(null);
  const [addToListConfirmation, setAddToListConfirmation] = useState<string | null>(null);
  const [inspoImportTarget, setInspoImportTarget] = useState<{
    category: ChecklistCategoryWithProducts;
    clip: ChecklistInspoClip;
  } | null>(null);

  const refreshAdminCatalog = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const cats = await fetchAdminShoppingCatalog();
      setAdminCategories(cats);
    } catch {
      setAdminCategories([]);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (manageMode && isAdmin) {
      void refreshAdminCatalog();
    }
  }, [manageMode, isAdmin, refreshAdminCatalog]);

  useEffect(() => {
    if (!addToListConfirmation) return;
    const timer = window.setTimeout(() => setAddToListConfirmation(null), 5000);
    return () => window.clearTimeout(timer);
  }, [addToListConfirmation]);

  const handleCatalogChanged = useCallback(() => {
    void refreshCatalog();
    void refreshAdminCatalog();
  }, [refreshCatalog, refreshAdminCatalog]);

  const groups = useMemo(() => topLevelCategories(categories), [categories]);
  const activeGroup = useMemo(
    () => categories.find((c) => c.id === groupId) ?? null,
    [categories, groupId],
  );
  const subcategories = useMemo(
    () => (activeGroup ? childCategories(categories, activeGroup.id) : []),
    [categories, activeGroup],
  );
  const openCategory = useMemo(
    () => categories.find((c) => c.id === openCategoryId) ?? null,
    [categories, openCategoryId],
  );
  const drawerCategory = useMemo(() => {
    if (!openCategoryId) return null;
    if (manageMode) {
      return adminCategories.find((c) => c.id === openCategoryId) ?? openCategory;
    }
    return openCategory;
  }, [adminCategories, manageMode, openCategory, openCategoryId]);

  const leaves = useMemo(() => leafCategories(categories), [categories]);
  const { done, total } = useMemo(
    () => ({
      done: leaves.filter((c) => isCategoryDone(c.id)).length,
      total: leaves.length,
    }),
    [leaves, isCategoryDone],
  );

  const scrollLeaves = useMemo(() => leafCategories(categories), [categories]);

  const scrollProgress = useMemo(
    () => ({
      done: scrollLeaves.filter((c) => isCategoryDone(c.id)).length,
      total: scrollLeaves.length,
    }),
    [scrollLeaves, isCategoryDone],
  );

  const progress = !manageMode && browseCategories ? scrollProgress : { done, total };

  const showScrollExperience = !manageMode;

  const placeProduct = useCallback(
    async (product: CuratedProduct) => {
      await addToList(product.id);
      const drawKind = getProductDrawKind(product);
      if (drawKind) {
        startChecklistDrawPlacement(product);
        onBack();
        return;
      }
      await placeCuratedProduct(product);
    },
    [addToList, onBack],
  );

  const galleryItems = activeGroup ? subcategories : groups;

  return (
    <div className="toova-page app-page checklist-page tv-scroll">
      <div className="toova-paper" aria-hidden />

      <header className="app-topbar">
        <div className="app-topbar-inner">
          <Button
            variant="mono"
            onClick={() => {
              if (activeGroup) setGroupId(null);
              else onBack();
            }}
          >
            ← {activeGroup ? 'Categories' : 'Back'}
          </Button>
          <Logo size={21} />
          {isAdmin ? (
            <Button
              size="sm"
              variant={manageMode ? 'primary' : 'outline'}
              onClick={() => setManageMode((v) => !v)}
            >
              {manageMode ? 'Done managing' : 'Manage'}
            </Button>
          ) : (
            <span className="checklist-page-topbar-actions">
              {onOpenLists && user ? (
                <Button size="sm" variant="outline" onClick={onOpenLists}>
                  Checklists
                </Button>
              ) : null}
              {onDesign ? (
                <Button size="sm" onClick={onDesign}>
                  Design your room
                </Button>
              ) : null}
              {!onOpenLists && !onDesign ? <span style={{ width: 96 }} aria-hidden /> : null}
            </span>
          )}
        </div>
      </header>

      <main
        className={`app-main checklist-page-main${
          showScrollExperience ? ' checklist-page-main--guide' : ''
        }`}
      >
        {showScrollExperience ? (
          <>
            <div className="checklist-guide-bundles">
              <BundleCards
                productsById={productsById}
                onRequestAddToList={(p) => setAddToListProduct(p)}
                canPlace={canPlace}
                onPlace={canPlace ? (p) => void placeProduct(p) : undefined}
                onAddProductToRoom={
                  canPlace
                    ? (productId) => {
                        const product = productsById[productId];
                        if (product) void placeProduct(product);
                      }
                    : undefined
                }
              />
            </div>

            {browseCategories ? (
              <ChecklistScrollGuide
                categories={categories}
                loading={loading}
                error={error}
                done={scrollProgress.done}
                total={scrollProgress.total}
                budgetSummary={budgetSummary}
                onSetBudget={(cents) => void setMoveInBudget(cents)}
                purchaseCartCount={purchaseCartLines.length}
                onOpenCheckout={() => setCheckoutOpen(true)}
                onOpenLists={onOpenLists}
                canPlace={canPlace}
                userId={user?.id ?? null}
                isAdmin={isAdmin}
                onRequestSignIn={onRequestSignIn}
                placedCategoryIds={placedCategoryIds}
                getOwnedProduct={getOwnedProduct}
                getResolution={getResolution}
                onRequestAddToList={(p) => setAddToListProduct(p)}
                onPlace={canPlace ? (p) => void placeProduct(p) : undefined}
                markCategoryAsOwned={(input) => void markCategoryAsOwned(input)}
                setResolution={setResolution}
                onUseInspoLook={(category, clip) => {
                  if (!user?.id) {
                    onRequestSignIn?.();
                    return;
                  }
                  setInspoImportTarget({ category, clip });
                }}
                onInspoClipSubmitted={() => void refreshCatalog()}
              />
            ) : null}

            {!browseCategories ? (
              <p className="checklist-guide-browse">
                <button
                  type="button"
                  className="shopping-lists-header-link"
                  onClick={() => setBrowseCategories(true)}
                >
                  Browse item-by-item categories
                </button>
              </p>
            ) : null}
          </>
        ) : null}

        {manageMode ? (
          <>
            <Eyebrow level="page">Catalog manage</Eyebrow>
            <SectionOpener
              level={4}
              title={activeGroup ? `${activeGroup.name}.` : 'The Toova checklist.'}
              note={`${done} of ${total} categories resolved`}
              style={{ marginTop: 24 }}
            />
            <p
              style={{
                font: 'var(--type-body-sm)',
                color: 'var(--ink-4)',
                maxWidth: 'var(--measure-body)',
                margin: '16px 0 32px',
              }}
            >
              {activeGroup
                ? 'Pick a subcategory to edit products and covers.'
                : 'Browse by category, then subcategory. Select a tile to open the product drawer.'}
            </p>

            {loading || !ready ? (
              <ChecklistRoomLoadPanel
                label={
                  !ready && !loading ? 'Loading checklist for this room…' : 'Loading checklist…'
                }
              />
            ) : null}
            {error ? <Banner tone="error">{error}</Banner> : null}

            {!loading && ready && !error ? (
              <div className="checklist-page-manage-layout">
                <div className="checklist-gallery" role="list">
                  {galleryItems.map((item) => {
                    const cover = categoryCoverImageUrl(item, categories);
                    const count = categoryProductCount(item, categories);
                    const isLeaf =
                      Boolean(item.parentId) ||
                      childCategories(categories, item.id).length === 0;
                    const doneLeaf = isLeaf && isCategoryDone(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="listitem"
                        className={`checklist-gallery-card${doneLeaf ? ' checklist-gallery-card--done' : ''}${openCategoryId === item.id ? ' checklist-gallery-card--selected' : ''}`}
                        onClick={() => {
                          if (
                            !item.parentId &&
                            childCategories(categories, item.id).length > 0
                          ) {
                            setGroupId(item.id);
                            setOpenCategoryId(null);
                            return;
                          }
                          setOpenCategoryId(item.id);
                        }}
                      >
                        <div className="checklist-gallery-media">
                          {cover ? (
                            <img
                              src={cover}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="checklist-gallery-fallback">
                              {item.name.slice(0, 1)}
                            </span>
                          )}
                        </div>
                        <div className="checklist-gallery-body">
                          <span className="checklist-gallery-name">{item.name}</span>
                          <MonoMeta size="sm" tone="dense">
                            {count === 0
                              ? 'Coming soon'
                              : `${count} option${count === 1 ? '' : 's'}`}
                          </MonoMeta>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <ChecklistAdminPanel
                  groupId={groupId}
                  openCategoryId={openCategoryId}
                  onGroupChange={setGroupId}
                  onOpenCategoryChange={setOpenCategoryId}
                  onCatalogChanged={handleCatalogChanged}
                />
              </div>
            ) : null}
          </>
        ) : null}

        <MonoMeta size="xs" tone="subtle" style={{ display: 'block', marginTop: 32 }}>
          As an Amazon Associate, Toova may earn from qualifying purchases. Prices may change.
        </MonoMeta>
      </main>

      {onDesign ? (
        <div className="checklist-continue-bar" role="region" aria-label="Continue">
          <div className="checklist-continue-bar__inner">
            <div className="checklist-continue-bar__copy">
              <MonoMeta size="sm" tone="dense" upper>
                {browseCategories
                  ? `${progress.done} of ${progress.total} categories resolved${
                      purchaseCartLines.length > 0
                        ? ` · ${purchaseCartLines.length} to buy`
                        : ''
                    }`
                  : purchaseCartLines.length > 0
                    ? `${purchaseCartLines.length} to buy`
                    : 'Room bundles'}
              </MonoMeta>
              <p className="checklist-continue-bar__hint">
                Saved automatically on this device
                {done > 0 ? ' — your checks stay when you design.' : '.'}
              </p>
            </div>
            <Button size="md" onClick={onDesign}>
              Continue to design
            </Button>
          </div>
        </div>
      ) : null}

      <SiteFooter
        onContact={onContact}
        onPitchMadness={onPitchMadness}
        onFeedback={() => setFeedbackOpen(true)}
        onAdmin={onAdmin}
      />
      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        pageSource="dashboard"
      />

      {checkoutOpen ? (
        <ChecklistCheckoutPanel
          lines={purchaseCartLines}
          onClose={() => setCheckoutOpen(false)}
          onRemoveFromList={(productId) => void removeFromList(productId)}
          onPlaceInRoom={
            canPlace
              ? async (product) => {
                  await placeProduct(product);
                  setCheckoutOpen(false);
                }
              : undefined
          }
        />
      ) : null}

      {drawerCategory ? (
        <ProductDrawer
          categoryName={drawerCategory.name}
          products={drawerCategory.products}
          canPlace={canPlace}
          adminMode={manageMode}
          lineStatus={
            openCategoryId
              ? checklistLineStatus(
                  placedCategoryIds.has(openCategoryId),
                  getResolution(openCategoryId),
                )
              : undefined
          }
          onMarkOwned={
            openCategoryId && !manageMode
              ? (input) => void markCategoryAsOwned({ categoryId: openCategoryId, ...input })
              : undefined
          }
          onSkip={
            openCategoryId && !manageMode
              ? () => void setResolution(openCategoryId, 'skip')
              : undefined
          }
          onUndo={
            openCategoryId && !manageMode
              ? () => void setResolution(openCategoryId, null)
              : undefined
          }
          ownedProduct={
            openCategoryId ? getOwnedProduct(openCategoryId) ?? null : null
          }
          onClose={() => {
            setOpenCategoryId(null);
            setProductModalOpen(false);
            setCategoryModalOpen(false);
            setEditingProduct(null);
          }}
          onAddToList={(p) => void addToList(p.id)}
          onRequestAddToList={(p) => setAddToListProduct(p)}
          onPlace={canPlace && !manageMode ? (p) => void placeProduct(p) : undefined}
          onAddProduct={
            manageMode
              ? () => {
                  setEditingProduct(null);
                  setProductModalOpen(true);
                }
              : undefined
          }
          onEditProduct={
            manageMode
              ? (p) => {
                  setEditingProduct(p);
                  setProductModalOpen(true);
                }
              : undefined
          }
          onDeleteProduct={
            manageMode
              ? (p) => {
                  if (!window.confirm(`Delete "${p.name}"?`)) return;
                  void deleteCuratedProduct(p.id).then(() => handleCatalogChanged());
                }
              : undefined
          }
          onEditCategory={
            manageMode
              ? () => setCategoryModalOpen(true)
              : undefined
          }
        />
      ) : null}

      {categoryModalOpen && drawerCategory && manageMode ? (
        <ChecklistCategoryModal
          open={categoryModalOpen}
          onClose={() => setCategoryModalOpen(false)}
          category={drawerCategory}
          onSaved={handleCatalogChanged}
        />
      ) : null}

      <AddToListModal
        open={addToListProduct != null}
        product={addToListProduct}
        userId={user?.id ?? null}
        activeRoomId={checklistRoomId}
        preferredListId={preferredListId}
        onClose={() => setAddToListProduct(null)}
        onRequestSignIn={onRequestSignIn}
        onAdded={({ listName, productName, syncedActiveRoom }) => {
          setAddToListConfirmation(`${productName} added to ${listName}`);
          if (!user?.id) return;
          if (syncedActiveRoom) void refreshListFromStorage();
        }}
      />

      {addToListConfirmation ? (
        <ChecklistAddedToast
          message={addToListConfirmation}
          onDismiss={() => setAddToListConfirmation(null)}
        />
      ) : null}

      {user?.id && productModalOpen && openCategoryId && manageMode ? (
        <ChecklistProductModal
          open={productModalOpen}
          onClose={() => {
            setProductModalOpen(false);
            setEditingProduct(null);
          }}
          userId={user.id}
          categoryId={openCategoryId}
          categoryName={drawerCategory?.name}
          product={editingProduct}
          existingProducts={drawerCategory?.products ?? []}
          onSaved={handleCatalogChanged}
        />
      ) : null}

      {user?.id && inspoImportTarget ? (
        <ImportModelModal
          open
          userId={user.id}
          initialTab="generate"
          initialTitle={inspoImportTarget.clip.title.trim() || inspoImportTarget.category.name}
          initialDescription={`From ${inspoImportTarget.clip.canonicalUrl}`}
          initialChecklistCategoryId={inspoImportTarget.category.id}
          isAdmin={isAdmin}
          onClose={() => setInspoImportTarget(null)}
          onAdded={() => {
            setInspoImportTarget(null);
            handleCatalogChanged();
          }}
        />
      ) : null}
    </div>
  );
}
