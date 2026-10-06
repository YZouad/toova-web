import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChecklistCategoryWithProducts, CuratedProduct } from '../lib/dormChecklist';
import {
  categoryCoverImageUrl,
  categoryProductCount,
  checklistLineStatus,
  childCategories,
  leafCategories,
  topLevelCategories,
  formatPriceCents,
} from '../lib/dormChecklist';
import { useShoppingCatalogContext } from '../context/ShoppingCatalogContext';
import { useAuth } from '../hooks/useAuth';
import { shopUrlForProduct } from '../lib/affiliateLinks';
import { trackAffiliateClicked } from '../lib/analytics';
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
import { ChecklistBudgetFoot } from './designer/ChecklistBudgetFoot';
import { ChecklistCheckoutPanel } from './ChecklistCheckoutPanel';

function pickTopProduct(products: CuratedProduct[]): CuratedProduct | null {
  const published = products.filter((p) => p.published);
  if (published.length === 0) return null;
  const recommended = published.find(
    (p) => /recommended/i.test(p.name) || /recommended/i.test(p.description),
  );
  if (recommended) return recommended;
  return [...published].sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
}

interface ChecklistPageProps {
  onBack: () => void;
  onDesign?: () => void;
  /** When true, Place actions are available (designer workspace active). */
  canPlace?: boolean;
  isAdmin?: boolean;
  onContact?: () => void;
  onPitchMadness?: () => void;
  onAdmin?: () => void;
}

export function ChecklistPage({
  onBack,
  onDesign,
  canPlace = false,
  isAdmin = false,
  onContact,
  onPitchMadness,
  onAdmin,
}: ChecklistPageProps) {
  const {
    categories,
    loading,
    error,
    isCategoryDone,
    addToList,
    refreshCatalog,
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
  const [groupId, setGroupId] = useState<string | null>(null);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [adminCategories, setAdminCategories] = useState<ChecklistCategoryWithProducts[]>([]);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CuratedProduct | null>(null);

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

  const topPicks = useMemo(() => {
    if (activeGroup) return [];
    const picks: { groupName: string; product: CuratedProduct }[] = [];
    for (const group of groups) {
      const children = childCategories(categories, group.id);
      const pool =
        children.length > 0
          ? children.flatMap((c) => c.products)
          : group.products;
      const product = pickTopProduct(pool);
      if (product) picks.push({ groupName: group.name, product });
    }
    return picks;
  }, [activeGroup, categories, groups]);

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
          ) : onDesign ? (
            <Button size="sm" onClick={onDesign}>
              Design your room
            </Button>
          ) : (
            <span style={{ width: 96 }} aria-hidden />
          )}
        </div>
      </header>

      <main className="app-main checklist-page-main">
        <Eyebrow level="page">Dorm essentials</Eyebrow>
        <SectionOpener
          level={4}
          title={activeGroup ? `${activeGroup.name}.` : 'The Toova checklist.'}
          note={`${done} of ${total} categories resolved`}
          style={{ marginTop: 24 }}
        />
        <p style={{ font: 'var(--type-body-sm)', color: 'var(--ink-4)', maxWidth: 'var(--measure-body)', margin: '16px 0 32px' }}>
          {activeGroup
            ? 'Pick a subcategory to see curated options. Shop links when available, or place a model in your room when one is attached.'
            : 'Browse by category, then subcategory. Tap a pick to shop, add it to your list, or place it in your room when a model is ready.'}
        </p>

        {!activeGroup ? (
          <div style={{ marginBottom: 32 }}>
            <BundleCards />
          </div>
        ) : null}

        {loading ? <Spinner label="Loading checklist…" /> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}

        {!loading && !error && !activeGroup && topPicks.length > 0 ? (
          <section className="checklist-top-picks" aria-label="Top picks">
            <MonoMeta size="xs" tone="dense" upper style={{ display: 'block', marginBottom: 12 }}>
              Top picks · shop in one tap
            </MonoMeta>
            <div className="checklist-top-picks__row">
              {topPicks.map(({ groupName, product }) => {
                const shop = shopUrlForProduct(product);
                const price = formatPriceCents(product.priceCents, product.currency);
                return (
                  <a
                    key={product.id}
                    className="checklist-top-picks__card"
                    href={shop.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackAffiliateClicked({
                        retailer: product.retailer,
                        product_id: product.id,
                        is_price_approximate: shop.approximate,
                        source: 'checklist_top_picks',
                      })
                    }
                  >
                    <div className="checklist-top-picks__media" aria-hidden>
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <span>{product.name.slice(0, 1)}</span>
                      )}
                    </div>
                    <div className="checklist-top-picks__body">
                      <MonoMeta size="xs" tone="dense">{groupName}</MonoMeta>
                      <span className="checklist-top-picks__name">{product.name}</span>
                      <span className="checklist-top-picks__cta">
                        {shop.approximate
                          ? shop.label
                          : price
                            ? `Shop ${price}`
                            : shop.label}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        ) : null}

        {!loading && !error ? (
          <div className="checklist-page-budget" style={{ marginBottom: 24, maxWidth: 420 }}>
            <ChecklistBudgetFoot
              budget={budgetSummary}
              onSetBudget={(cents) => void setMoveInBudget(cents)}
            />
            <Button
              size="sm"
              variant="outline"
              style={{ marginTop: 12, width: '100%' }}
              disabled={purchaseCartLines.length === 0}
              onClick={() => setCheckoutOpen(true)}
            >
              Checkout · {purchaseCartLines.length} item{purchaseCartLines.length === 1 ? '' : 's'}
            </Button>
          </div>
        ) : null}

        {!loading && !error ? (
          <div className={manageMode ? 'checklist-page-manage-layout' : undefined}>
            <div className="checklist-gallery" role="list">
              {galleryItems.map((item) => {
                const cover = categoryCoverImageUrl(item, categories);
                const count = categoryProductCount(item, categories);
                const isLeaf = Boolean(item.parentId) || childCategories(categories, item.id).length === 0;
                const doneLeaf = isLeaf && isCategoryDone(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="listitem"
                    className={`checklist-gallery-card${doneLeaf ? ' checklist-gallery-card--done' : ''}${manageMode && openCategoryId === item.id ? ' checklist-gallery-card--selected' : ''}`}
                    onClick={() => {
                      if (!item.parentId && childCategories(categories, item.id).length > 0) {
                        setGroupId(item.id);
                        if (manageMode) setOpenCategoryId(null);
                        return;
                      }
                      setOpenCategoryId(item.id);
                    }}
                  >
                    <div className="checklist-gallery-media">
                      {cover ? (
                        <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="checklist-gallery-fallback">{item.name.slice(0, 1)}</span>
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

            {manageMode ? (
              <ChecklistAdminPanel
                groupId={groupId}
                openCategoryId={openCategoryId}
                onGroupChange={setGroupId}
                onOpenCategoryChange={setOpenCategoryId}
                onCatalogChanged={handleCatalogChanged}
              />
            ) : null}
          </div>
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
                {done} of {total} categories resolved
                {purchaseCartLines.length > 0
                  ? ` · ${purchaseCartLines.length} to buy`
                  : ''}
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
    </div>
  );
}
