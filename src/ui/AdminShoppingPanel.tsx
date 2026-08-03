import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  fetchAdminShoppingCatalog,
} from '../lib/shoppingCatalog';
import type { ChecklistCategoryWithProducts, CuratedProduct } from '../lib/dormChecklist';
import { PRODUCT_IMAGES_BUCKET, formatPriceCents } from '../lib/dormChecklist';
import { FURNITURE } from '../furniture/registry';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || `item-${Date.now()}`;
}

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
      {error ? <div className="tv-banner-error" role="alert">{error}</div> : null}
      {loading ? <p>Loading shopping catalog…</p> : null}

      <div className="admin-shopping-layout">
        <aside className="admin-shopping-cats">
          <div className="admin-shopping-cats-head">
            <h3>Categories</h3>
            <button type="button" className="tv-btn-ghost product-drawer-btn" disabled={busy} onClick={() => void addCategory()}>
              + Add
            </button>
          </div>
          <ul>
            {categories.map((cat) => (
              <li key={cat.id}>
                <button
                  type="button"
                  className={cat.id === selectedCategoryId ? 'is-active' : undefined}
                  onClick={() => setSelectedCategoryId(cat.id)}
                >
                  <span>{cat.name}</span>
                  <span>{cat.products.length}</span>
                </button>
                <label className="admin-shopping-publish">
                  <input
                    type="checkbox"
                    checked={cat.published}
                    onChange={(e) => void toggleCategoryPublished(cat.id, e.target.checked)}
                  />
                  Published
                </label>
              </li>
            ))}
          </ul>
        </aside>

        <div className="admin-shopping-products">
          {selected ? (
            <>
              <h3>{selected.name} products</h3>
              <ul className="admin-shopping-product-list">
                {selected.products.map((p) => (
                  <li key={p.id} className="admin-shopping-product-card">
                    <div className="admin-shopping-thumb" aria-hidden>
                      {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <span>{p.name.slice(0, 1)}</span>}
                    </div>
                    <div>
                      <strong>{p.name}</strong>
                      <div>{formatPriceCents(p.priceCents, p.currency) ?? 'No price'} · {p.retailer}</div>
                      <div className="admin-shopping-product-actions">
                        <label className="tv-btn-ghost product-drawer-btn">
                          Image
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
                        <button type="button" className="tv-btn-ghost product-drawer-btn" onClick={() => void toggleProductPublished(p)}>
                          {p.published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button type="button" className="tv-btn-ghost product-drawer-btn" onClick={() => void deleteProduct(p.id)}>
                          Delete
                        </button>
                      </div>
                      <a href={p.affiliateUrl} target="_blank" rel="noopener noreferrer">
                        {p.affiliateUrl}
                      </a>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="admin-shopping-form">
                <h4>Add product</h4>
                <input
                  placeholder="Name"
                  value={productForm.name}
                  onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                />
                <textarea
                  placeholder="Description"
                  value={productForm.description}
                  onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                />
                <input
                  placeholder="Affiliate URL"
                  value={productForm.affiliateUrl}
                  onChange={(e) => setProductForm((f) => ({ ...f, affiliateUrl: e.target.value }))}
                />
                <div className="admin-shopping-form-row">
                  <input
                    placeholder="Price (USD)"
                    value={productForm.priceDollars}
                    onChange={(e) => setProductForm((f) => ({ ...f, priceDollars: e.target.value }))}
                  />
                  <input
                    placeholder="Retailer"
                    value={productForm.retailer}
                    onChange={(e) => setProductForm((f) => ({ ...f, retailer: e.target.value }))}
                  />
                  <select
                    value={productForm.placeBuiltinKind}
                    onChange={(e) => setProductForm((f) => ({ ...f, placeBuiltinKind: e.target.value }))}
                  >
                    <option value="">No place mapping</option>
                    {builtinKinds.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={productForm.published}
                    onChange={(e) => setProductForm((f) => ({ ...f, published: e.target.checked }))}
                  />{' '}
                  Published
                </label>
                <button type="button" className="tv-btn-primary" disabled={busy} onClick={() => void addProduct()}>
                  Add product
                </button>
              </div>
            </>
          ) : (
            <p>Select a category</p>
          )}
        </div>
      </div>
    </div>
  );
}
