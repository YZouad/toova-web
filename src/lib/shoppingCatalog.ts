import { supabase } from './supabase';
import {
  loadCheckedIds,
  loadLocalShoppingList,
  productImagePublicUrl,
  type ChecklistCategory,
  type ChecklistCategoryWithProducts,
  type CuratedProduct,
  type ShoppingListEntry,
} from './dormChecklist';

function mapCategory(row: Record<string, unknown>): ChecklistCategory {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    sortOrder: Number(row.sort_order ?? 0),
    published: row.published !== false,
  };
}

function mapProduct(row: Record<string, unknown>): CuratedProduct {
  const imagePath =
    row.image_path != null && String(row.image_path).trim()
      ? String(row.image_path).trim()
      : null;
  return {
    id: String(row.id),
    categoryId: String(row.category_id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description ?? ''),
    retailer: String(row.retailer ?? 'Amazon'),
    affiliateUrl: String(row.affiliate_url),
    priceCents:
      row.price_cents == null || row.price_cents === ''
        ? null
        : Number(row.price_cents),
    currency: String(row.currency ?? 'USD'),
    imagePath,
    imageUrl: productImagePublicUrl(imagePath),
    sortOrder: Number(row.sort_order ?? 0),
    published: row.published !== false,
    lastVerifiedAt:
      row.last_verified_at != null ? String(row.last_verified_at) : null,
    placeBuiltinKind:
      row.place_builtin_kind != null && String(row.place_builtin_kind).trim()
        ? String(row.place_builtin_kind)
        : null,
    placeCatalogKind:
      row.place_catalog_kind != null && String(row.place_catalog_kind).trim()
        ? String(row.place_catalog_kind)
        : null,
  };
}

export async function fetchPublishedShoppingCatalog(): Promise<ChecklistCategoryWithProducts[]> {
  const [{ data: catRows, error: catErr }, { data: prodRows, error: prodErr }] =
    await Promise.all([
      supabase
        .from('checklist_categories')
        .select('id,slug,name,sort_order,published')
        .eq('published', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('curated_products')
        .select(
          'id,category_id,slug,name,description,retailer,affiliate_url,price_cents,currency,image_path,sort_order,published,last_verified_at,place_builtin_kind,place_catalog_kind',
        )
        .eq('published', true)
        .order('sort_order', { ascending: true }),
    ]);

  if (catErr) throw new Error(catErr.message);
  if (prodErr) throw new Error(prodErr.message);

  const productsByCat = new Map<string, CuratedProduct[]>();
  for (const raw of prodRows ?? []) {
    const p = mapProduct(raw as Record<string, unknown>);
    const list = productsByCat.get(p.categoryId) ?? [];
    list.push(p);
    productsByCat.set(p.categoryId, list);
  }

  return (catRows ?? []).map((raw) => {
    const cat = mapCategory(raw as Record<string, unknown>);
    return {
      ...cat,
      products: productsByCat.get(cat.id) ?? [],
    };
  });
}

/** Admin: all categories/products including unpublished. */
export async function fetchAdminShoppingCatalog(): Promise<ChecklistCategoryWithProducts[]> {
  const [{ data: catRows, error: catErr }, { data: prodRows, error: prodErr }] =
    await Promise.all([
      supabase
        .from('checklist_categories')
        .select('id,slug,name,sort_order,published')
        .order('sort_order', { ascending: true }),
      supabase
        .from('curated_products')
        .select(
          'id,category_id,slug,name,description,retailer,affiliate_url,price_cents,currency,image_path,sort_order,published,last_verified_at,place_builtin_kind,place_catalog_kind',
        )
        .order('sort_order', { ascending: true }),
    ]);

  if (catErr) throw new Error(catErr.message);
  if (prodErr) throw new Error(prodErr.message);

  const productsByCat = new Map<string, CuratedProduct[]>();
  for (const raw of prodRows ?? []) {
    const p = mapProduct(raw as Record<string, unknown>);
    const list = productsByCat.get(p.categoryId) ?? [];
    list.push(p);
    productsByCat.set(p.categoryId, list);
  }

  return (catRows ?? []).map((raw) => {
    const cat = mapCategory(raw as Record<string, unknown>);
    return {
      ...cat,
      products: productsByCat.get(cat.id) ?? [],
    };
  });
}

export async function fetchUserChecklistProgress(
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('user_checklist_progress')
    .select('category_id,checked')
    .eq('user_id', userId)
    .eq('checked', true);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => String(r.category_id)));
}

export async function upsertChecklistProgress(
  userId: string,
  categoryId: string,
  checked: boolean,
): Promise<void> {
  if (!checked) {
    const { error } = await supabase
      .from('user_checklist_progress')
      .delete()
      .eq('user_id', userId)
      .eq('category_id', categoryId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.from('user_checklist_progress').upsert(
    {
      user_id: userId,
      category_id: categoryId,
      checked: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,category_id' },
  );
  if (error) throw new Error(error.message);
}

export async function fetchUserShoppingList(
  userId: string,
): Promise<ShoppingListEntry[]> {
  const { data, error } = await supabase
    .from('user_shopping_list')
    .select('product_id,quantity,review_done')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    productId: String(r.product_id),
    quantity: Number(r.quantity) > 0 ? Number(r.quantity) : 1,
    reviewDone: r.review_done === true,
  }));
}

export async function upsertShoppingListEntry(
  userId: string,
  entry: ShoppingListEntry,
): Promise<void> {
  const { error } = await supabase.from('user_shopping_list').upsert(
    {
      user_id: userId,
      product_id: entry.productId,
      quantity: entry.quantity,
      review_done: entry.reviewDone,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,product_id' },
  );
  if (error) throw new Error(error.message);
}

export async function removeShoppingListEntry(
  userId: string,
  productId: string,
): Promise<void> {
  const { error } = await supabase
    .from('user_shopping_list')
    .delete()
    .eq('user_id', userId)
    .eq('product_id', productId);
  if (error) throw new Error(error.message);
}

/** Merge local progress/list into account (local wins on conflicts for checked / qty). */
export async function mergeLocalShoppingStateToAccount(userId: string): Promise<void> {
  const localChecked = loadCheckedIds();
  const localList = loadLocalShoppingList();

  const remoteChecked = await fetchUserChecklistProgress(userId);
  const remoteList = await fetchUserShoppingList(userId);

  const mergedChecked = new Set([...remoteChecked, ...localChecked]);
  for (const categoryId of mergedChecked) {
    if (!remoteChecked.has(categoryId)) {
      await upsertChecklistProgress(userId, categoryId, true);
    }
  }

  const byProduct = new Map(remoteList.map((e) => [e.productId, e]));
  for (const entry of localList) {
    const existing = byProduct.get(entry.productId);
    if (!existing) {
      byProduct.set(entry.productId, entry);
      await upsertShoppingListEntry(userId, entry);
    } else {
      const next: ShoppingListEntry = {
        productId: entry.productId,
        quantity: Math.max(existing.quantity, entry.quantity),
        reviewDone: existing.reviewDone || entry.reviewDone,
      };
      byProduct.set(entry.productId, next);
      await upsertShoppingListEntry(userId, next);
    }
  }
}

export { mapProduct, mapCategory };
