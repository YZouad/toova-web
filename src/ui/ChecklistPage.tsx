import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChecklistCategoryWithProducts, CuratedProduct } from '../lib/dormChecklist';
import {
  categoryCoverImageUrl,
  categoryProductCount,
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
import { placeCuratedProduct } from '../lib/placeCuratedProduct';
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
import { ChecklistAdminPanel } from './ChecklistAdminPanel';

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
  } = useShoppingCatalogContext();
  const { user } = useAuth();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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

  const placeProduct = useCallback(
    async (product: CuratedProduct) => {
      await addToList(product.id);
      await placeCuratedProduct(product);
    },
    [addToList],
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
          note={`${done} of ${total} packed`}
          style={{ marginTop: 24 }}
        />
        <p style={{ font: 'var(--type-body-sm)', color: 'var(--ink-4)', maxWidth: 'var(--measure-body)', margin: '16px 0 32px' }}>
          {activeGroup
            ? 'Pick a subcategory to see curated options. Shop links when available, or place a model in your room when one is attached.'
            : 'Browse by category, then subcategory. Tap a pick to shop, add it to your list, or place it in your room when a model is ready.'}
        </p>

        {loading ? <Spinner label="Loading checklist…" /> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}

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
                {done} of {total} packed
                {list.length > 0 ? ` · ${list.length} on To Buy` : ''}
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

      {drawerCategory ? (
        <ProductDrawer
          categoryName={drawerCategory.name}
          products={drawerCategory.products}
          canPlace={canPlace}
          adminMode={manageMode}
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
