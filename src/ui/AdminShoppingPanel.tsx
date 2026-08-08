import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAdminShoppingCatalog } from '../lib/shoppingCatalog';
import type { ChecklistCategoryWithProducts, CuratedProduct } from '../lib/dormChecklist';
import { formatPriceCents } from '../lib/dormChecklist';
import { useAuth } from '../hooks/useAuth';
import {
  createChecklistCategory,
  deleteCuratedProduct,
  updateChecklistCategory,
  updateCuratedProduct,
} from '../lib/shoppingCatalogAdmin';
import { ChecklistProductModal } from './ChecklistProductModal';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  Field,
  Input,
  MonoMeta,
  RuledTable,
  SectionOpener,
  Select,
  Spinner,
} from './kit';

const panelStyle = {
  background: 'var(--bg-raised)',
  border: '1px solid var(--rule-soft)',
  boxShadow: 'var(--shadow-panel)',
  padding: 14,
} as const;

function categoryLabel(cat: ChecklistCategoryWithProducts, categories: ChecklistCategoryWithProducts[]): string {
  if (!cat.parentId) return cat.name;
  const parent = categories.find((c) => c.id === cat.parentId);
  return parent ? `${parent.name} › ${cat.name}` : cat.name;
}

export function AdminShoppingPanel() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<ChecklistCategoryWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CuratedProduct | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cats = await fetchAdminShoppingCatalog();
      setCategories(cats);
      setSelectedCategoryId((prev) => prev ?? cats[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load shopping catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = categories.find((c) => c.id === selectedCategoryId) ?? null;
  const isLeafCategory = Boolean(selected?.parentId);

  const parentOptions = useMemo(
    () => [
      { value: '', label: 'Top-level group' },
      ...categories
        .filter((c) => !c.parentId)
        .map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  );

  async function addCategory() {
    if (!newCategoryName.trim()) {
      setError('Category name is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createChecklistCategory(
        {
          name: newCategoryName.trim(),
          parentId: newCategoryParentId || null,
        },
        categories,
      );
      setNewCategoryName('');
      setNewCategoryParentId('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add category');
    } finally {
      setBusy(false);
    }
  }

  async function toggleCategoryPublished(catId: string, published: boolean) {
    setBusy(true);
    try {
      await updateChecklistCategory(catId, { published });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleProductPublished(product: CuratedProduct) {
    setBusy(true);
    try {
      await updateCuratedProduct(product.id, { published: !product.published });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(productId: string) {
    if (!window.confirm('Delete this product?')) return;
    setBusy(true);
    try {
      await deleteCuratedProduct(productId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  function openAddProduct() {
    setEditingProduct(null);
    setProductModalOpen(true);
  }

  function openEditProduct(product: CuratedProduct) {
    setEditingProduct(product);
    setProductModalOpen(true);
  }

  return (
    <div className="admin-shopping">
      {error ? <Banner tone="error">{error}</Banner> : null}
      {loading ? <Spinner label="Loading shopping catalog…" /> : null}

      <div className="admin-shopping-layout">
        <aside className="admin-shopping-cats" style={panelStyle}>
          <div className="admin-shopping-cats-head">
            <h3 className="admin-shopping-cats-title">Categories.</h3>
          </div>
          <div className="admin-shopping-add-cat" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <Field label="New category">
              <Input
                placeholder="Category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                disabled={busy}
              />
            </Field>
            <Field label="Parent">
              <Select
                value={newCategoryParentId}
                onChange={setNewCategoryParentId}
                disabled={busy}
                options={parentOptions}
              />
            </Field>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void addCategory()}>
              + Add category
            </Button>
          </div>
          <div className="admin-shopping-cats-cols" aria-hidden>
            <span>Category</span>
            <span>Published</span>
          </div>
          <ul>
            {categories.map((cat) => (
              <li key={cat.id} className="admin-shopping-cat-row">
                <button
                  type="button"
                  className={cat.id === selectedCategoryId ? 'is-active' : undefined}
                  onClick={() => setSelectedCategoryId(cat.id)}
                >
                  <span className="admin-shopping-cat-name">{categoryLabel(cat, categories)}</span>
                  <Badge tone="neutral">{cat.products.length}</Badge>
                </button>
                <Checkbox
                  checked={cat.published}
                  ariaLabel={`Published: ${cat.name}`}
                  onChange={(next) => void toggleCategoryPublished(cat.id, next)}
                  disabled={busy}
                  className="admin-shopping-cat-pub"
                />
              </li>
            ))}
          </ul>
        </aside>

        <div className="admin-shopping-products" style={panelStyle}>
          {selected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                <SectionOpener level={5} title={`${selected.name} products.`} style={{ marginBottom: 0 }} />
                {isLeafCategory && user?.id ? (
                  <Button size="sm" onClick={openAddProduct}>
                    Add product
                  </Button>
                ) : null}
              </div>
              {!isLeafCategory ? (
                <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 16 }}>
                  Select a subcategory (leaf) to add products.
                </MonoMeta>
              ) : null}
              {selected.products.length === 0 ? (
                <MonoMeta size="sm" tone="dense">No products in this category yet.</MonoMeta>
              ) : (
                <RuledTable
                  columns={[
                    { label: 'Product' },
                    { label: 'Price', align: 'right' },
                    { label: 'Status', align: 'right' },
                    { label: 'Actions', align: 'right' },
                  ]}
                  rows={selected.products.map((p) => [
                    <div key={`${p.id}-info`}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div className="admin-shopping-thumb" aria-hidden>
                          {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <span>{p.name.slice(0, 1)}</span>}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ font: 'var(--type-ui-sm)', fontWeight: 600 }}>{p.name}</div>
                          <MonoMeta size="xs" tone="dense" style={{ display: 'block', marginTop: 4 }}>
                            {p.retailer}
                            {p.affiliateUrl ? ' · ' : null}
                            {p.affiliateUrl ? (
                              <a
                                href={p.affiliateUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--accent-text)', wordBreak: 'break-all' }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {p.affiliateUrl}
                              </a>
                            ) : null}
                          </MonoMeta>
                        </div>
                      </div>
                    </div>,
                    <MonoMeta key={`${p.id}-price`} size="sm">
                      {formatPriceCents(p.priceCents, p.currency) ?? 'No price'}
                    </MonoMeta>,
                    <Badge key={`${p.id}-pub`} tone={p.published ? 'success' : 'neutral'}>
                      {p.published ? 'Published' : 'Draft'}
                    </Badge>,
                    <div key={`${p.id}-actions`} style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <Button size="sm" variant="outline" onClick={() => openEditProduct(p)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void toggleProductPublished(p)}>
                        {p.published ? 'Unpublish' : 'Publish'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void deleteProduct(p.id)} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                        Delete
                      </Button>
                    </div>,
                  ])}
                  style={{ marginBottom: 24 }}
                />
              )}
            </>
          ) : (
            <MonoMeta size="sm" tone="dense">Select a category</MonoMeta>
          )}
        </div>
      </div>

      {user?.id && productModalOpen && selected && isLeafCategory ? (
        <ChecklistProductModal
          open={productModalOpen}
          onClose={() => {
            setProductModalOpen(false);
            setEditingProduct(null);
          }}
          userId={user.id}
          categoryId={selected.id}
          categoryName={selected.name}
          product={editingProduct}
          existingProducts={selected.products}
          onSaved={() => void refresh()}
        />
      ) : null}
    </div>
  );
}
