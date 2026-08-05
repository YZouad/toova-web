import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  fetchAdminShoppingCatalog,
} from '../lib/shoppingCatalog';
import type { ChecklistCategoryWithProducts, CuratedProduct } from '../lib/dormChecklist';
import { PRODUCT_IMAGES_BUCKET, formatPriceCents } from '../lib/dormChecklist';
import { FURNITURE } from '../furniture/registry';
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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || `item-${Date.now()}`;
}

const panelStyle = {
  background: 'var(--bg-raised)',
  border: '1px solid var(--rule-soft)',
  boxShadow: 'var(--shadow-panel)',
  padding: 14,
} as const;

export function AdminShoppingPanel() {
  const [categories, setCategories] = useState<ChecklistCategoryWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    affiliateUrl: '',
    priceDollars: '',
    retailer: 'Amazon',
    placeBuiltinKind: '',
    published: true,
  });

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

  async function addCategory() {
    const name = window.prompt('Category name');
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const slug = slugify(name);
      const sortOrder = (categories[categories.length - 1]?.sortOrder ?? 0) + 10;
      const { error: err } = await supabase.from('checklist_categories').insert({
        name: name.trim(),
        slug,
        sort_order: sortOrder,
        published: true,
      });
      if (err) throw new Error(err.message);
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
      const { error: err } = await supabase
        .from('checklist_categories')
        .update({ published, updated_at: new Date().toISOString() })
        .eq('id', catId);
      if (err) throw new Error(err.message);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function addProduct() {
    if (!selected) return;
    if (!productForm.name.trim() || !productForm.affiliateUrl.trim()) {
      setError('Name and affiliate URL are required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const priceCents = productForm.priceDollars.trim()
        ? Math.round(Number(productForm.priceDollars) * 100)
        : null;
      const { error: err } = await supabase.from('curated_products').insert({
        category_id: selected.id,
        slug: slugify(productForm.name),
        name: productForm.name.trim(),
        description: productForm.description.trim(),
        affiliate_url: productForm.affiliateUrl.trim(),
        retailer: productForm.retailer.trim() || 'Amazon',
        price_cents: Number.isFinite(priceCents as number) ? priceCents : null,
        published: productForm.published,
        last_verified_at: new Date().toISOString(),
        place_builtin_kind: productForm.placeBuiltinKind || null,
        sort_order: (selected.products[selected.products.length - 1]?.sortOrder ?? 0) + 10,
      });
      if (err) throw new Error(err.message);
      setProductForm({
        name: '',
        description: '',
        affiliateUrl: '',
        priceDollars: '',
        retailer: 'Amazon',
        placeBuiltinKind: '',
        published: true,
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add product');
    } finally {
      setBusy(false);
    }
  }

  async function toggleProductPublished(product: CuratedProduct) {
    setBusy(true);
    try {
      const { error: err } = await supabase
        .from('curated_products')
        .update({
          published: !product.published,
          updated_at: new Date().toISOString(),
        })
        .eq('id', product.id);
      if (err) throw new Error(err.message);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(product: CuratedProduct, file: File) {
    setBusy(true);
    try {
      const path = `${product.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      const { error: upErr } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const { error: err } = await supabase
        .from('curated_products')
        .update({ image_path: path, updated_at: new Date().toISOString() })
        .eq('id', product.id);
      if (err) throw new Error(err.message);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(productId: string) {
    if (!window.confirm('Delete this product?')) return;
    setBusy(true);
    try {
      const { error: err } = await supabase
        .from('curated_products')
        .delete()
        .eq('id', productId);
      if (err) throw new Error(err.message);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  const builtinKinds = Object.keys(FURNITURE);

  return (
    <div className="admin-shopping">
      {error ? <Banner tone="error">{error}</Banner> : null}
      {loading ? <Spinner label="Loading shopping catalog…" /> : null}

      <div className="admin-shopping-layout">
        <aside className="admin-shopping-cats" style={panelStyle}>
          <div className="admin-shopping-cats-head">
            <h3 className="admin-shopping-cats-title">Categories.</h3>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void addCategory()}>
              + Add
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
                  <span className="admin-shopping-cat-name">{cat.name}</span>
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
              <SectionOpener level={5} title={`${selected.name} products.`} style={{ marginBottom: 16 }} />
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
                      <label>
                        <Button size="sm" variant="outline" as="span">Image</Button>
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadImage(p, file);
                          }}
                        />
                      </label>
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

              <SectionOpener level={5} title="Add product." style={{ marginBottom: 16 }} />
              <div className="admin-shopping-form" style={{ display: 'grid', gap: 12 }}>
                <Field label="Name">
                  <Input
                    placeholder="Name"
                    value={productForm.name}
                    onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    className="kit-input"
                    placeholder="Description"
                    value={productForm.description}
                    onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </Field>
                <Field label="Affiliate URL">
                  <Input
                    placeholder="Affiliate URL"
                    value={productForm.affiliateUrl}
                    onChange={(e) => setProductForm((f) => ({ ...f, affiliateUrl: e.target.value }))}
                  />
                </Field>
                <div className="admin-shopping-form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <Field label="Price (USD)">
                    <Input
                      placeholder="Price (USD)"
                      value={productForm.priceDollars}
                      onChange={(e) => setProductForm((f) => ({ ...f, priceDollars: e.target.value }))}
                    />
                  </Field>
                  <Field label="Retailer">
                    <Input
                      placeholder="Retailer"
                      value={productForm.retailer}
                      onChange={(e) => setProductForm((f) => ({ ...f, retailer: e.target.value }))}
                    />
                  </Field>
                  <Field label="Place mapping">
                    <Select
                      value={productForm.placeBuiltinKind}
                      onChange={(value) => setProductForm((f) => ({ ...f, placeBuiltinKind: value }))}
                      options={[
                        { value: '', label: 'No place mapping' },
                        ...builtinKinds.map((k) => ({ value: k, label: k })),
                      ]}
                    />
                  </Field>
                </div>
                <Checkbox
                  checked={productForm.published}
                  label="Published"
                  onChange={(next) => setProductForm((f) => ({ ...f, published: next }))}
                />
                <Button size="sm" disabled={busy} onClick={() => void addProduct()}>
                  Add product
                </Button>
              </div>
            </>
          ) : (
            <MonoMeta size="sm" tone="dense">Select a category</MonoMeta>
          )}
        </div>
      </div>
    </div>
  );
}
