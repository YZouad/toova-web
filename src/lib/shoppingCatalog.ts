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
  const imagePath =
    row.image_path != null && String(row.image_path).trim()
      ? String(row.image_path).trim()
      : null;
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    sortOrder: Number(row.sort_order ?? 0),
    published: row.published !== false,
    parentId:
      row.parent_id != null && String(row.parent_id).trim()
        ? String(row.parent_id)
        : null,
    imagePath,
    imageUrl: productImagePublicUrl(imagePath),
  };
}

function mapProduct(row: Record<string, unknown>): CuratedProduct {
  const imagePath =
    row.image_path != null && String(row.image_path).trim()
      ? String(row.image_path).trim()
      : null;
  const bulletsRaw = row.feature_bullets;
  const featureBullets = Array.isArray(bulletsRaw)
    ? bulletsRaw
        .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
        .map((b) => b.trim())
    : [];
  const ratingRaw = row.rating;
  const rating =
    ratingRaw == null || ratingRaw === ''
      ? null
      : Number(ratingRaw);
  const reviewRaw = row.review_count;
  const reviewCount =
    reviewRaw == null || reviewRaw === ''
      ? null
      : Math.max(0, Math.floor(Number(reviewRaw)));
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
    brand:
      row.brand != null && String(row.brand).trim()
        ? String(row.brand).trim()
        : null,
    featureBullets,
    dimensionsText:
      row.dimensions_text != null && String(row.dimensions_text).trim()
        ? String(row.dimensions_text).trim()
        : null,
    rating: rating != null && Number.isFinite(rating) ? rating : null,
    reviewCount:
      reviewCount != null && Number.isFinite(reviewCount) ? reviewCount : null,
    availability:
      row.availability != null && String(row.availability).trim()
        ? String(row.availability).trim()
        : null,
  };
}

const CURATED_PRODUCT_SELECT =
  'id,category_id,slug,name,description,retailer,affiliate_url,price_cents,currency,image_path,sort_order,published,last_verified_at,place_builtin_kind,place_catalog_kind,brand,feature_bullets,dimensions_text,rating,review_count,availability';

const CURATED_PRODUCT_SELECT_LEGACY =
  'id,category_id,slug,name,description,retailer,affiliate_url,price_cents,currency,image_path,sort_order,published,last_verified_at,place_builtin_kind,place_catalog_kind';

async function fetchCuratedProductRows(publishedOnly: boolean) {
  let query = supabase.from('curated_products').select(CURATED_PRODUCT_SELECT);
  if (publishedOnly) query = query.eq('published', true);
  const first = await query.order('sort_order', { ascending: true });
  if (!first.error) return first;

  // Older DBs may not have detail columns yet — fall back gracefully.
  const msg = first.error.message.toLowerCase();
  if (
    msg.includes('brand') ||
    msg.includes('feature_bullets') ||
    msg.includes('dimensions_text') ||
    msg.includes('rating') ||
    msg.includes('review_count') ||
    msg.includes('availability') ||
    msg.includes('schema cache') ||
    msg.includes('column')
  ) {
    let legacy = supabase.from('curated_products').select(CURATED_PRODUCT_SELECT_LEGACY);
    if (publishedOnly) legacy = legacy.eq('published', true);
    return legacy.order('sort_order', { ascending: true });
  }
  return first;
}

export async function fetchPublishedShoppingCatalog(): Promise<ChecklistCategoryWithProducts[]> {
  const [{ data: catRows, error: catErr }, prodResult] = await Promise.all([
    supabase
      .from('checklist_categories')
      .select('id,slug,name,sort_order,published,parent_id,image_path')
      .eq('published', true)
      .order('sort_order', { ascending: true }),
    fetchCuratedProductRows(true),
  ]);


  if (catErr) throw new Error(catErr.message);
  if (prodResult.error) throw new Error(prodResult.error.message);
  const prodRows = prodResult.data;

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
  const [{ data: catRows, error: catErr }, prodResult] = await Promise.all([
    supabase
      .from('checklist_categories')
      .select('id,slug,name,sort_order,published,parent_id,image_path')
      .order('sort_order', { ascending: true }),
    fetchCuratedProductRows(false),
  ]);


  if (catErr) throw new Error(catErr.message);
  if (prodResult.error) throw new Error(prodResult.error.message);
  const prodRows = prodResult.data;

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
