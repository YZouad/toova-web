import { supabase } from './supabase';
import { uploadCatalogModel } from './catalogModelUpload';
import {
  PRODUCT_IMAGES_BUCKET,
  type ChecklistCategoryWithProducts,
  childCategories,
} from './dormChecklist';

export function slugifyChecklist(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || `item-${Date.now()}`
  );
}

export function parsePriceDollarsToCents(dollars: string): number | null {
  const trimmed = dollars.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Leaf subcategories (have a parent; hold products). */
export function adminLeafCategories(
  categories: ChecklistCategoryWithProducts[],
): ChecklistCategoryWithProducts[] {
  return categories.filter((c) => Boolean(c.parentId));
}

export async function uploadProductCoverImage(
  file: File,
  pathPrefix: string,
): Promise<string> {
  const safeName = file.name.replace(/[^\w.-]+/g, '_');
  const path = `${pathPrefix}/${crypto.randomUUID()}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (upErr) throw new Error(upErr.message);
  return path;
}

export interface CreateCategoryInput {
  name: string;
  parentId?: string | null;
  published?: boolean;
  sortOrder?: number;
}

export async function createChecklistCategory(
  input: CreateCategoryInput,
  siblingCategories: ChecklistCategoryWithProducts[],
): Promise<string> {
  const parentId = input.parentId ?? null;
  const siblings = siblingCategories.filter((c) =>
    parentId ? c.parentId === parentId : !c.parentId,
  );
  const sortOrder =
    input.sortOrder ??
    (siblings[siblings.length - 1]?.sortOrder ?? 0) + 10;

  const { data, error } = await supabase
    .from('checklist_categories')
    .insert({
      name: input.name.trim(),
      slug: slugifyChecklist(input.name),
      parent_id: parentId,
      sort_order: sortOrder,
      published: input.published ?? true,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return String(data.id);
}

export interface UpdateCategoryInput {
  name?: string;
  published?: boolean;
  sortOrder?: number;
  parentId?: string | null;
  imagePath?: string | null;
}

export async function updateChecklistCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<void> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.name != null) {
    patch.name = input.name.trim();
    patch.slug = slugifyChecklist(input.name);
  }
  if (input.published != null) patch.published = input.published;
  if (input.sortOrder != null) patch.sort_order = input.sortOrder;
  if (input.parentId !== undefined) patch.parent_id = input.parentId;
  if (input.imagePath !== undefined) patch.image_path = input.imagePath;

  const { error } = await supabase.from('checklist_categories').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function attachCategoryCoverImage(
  categoryId: string,
  file: File,
): Promise<string> {
  const path = await uploadProductCoverImage(file, `categories/${categoryId}`);
  await updateChecklistCategory(categoryId, { imagePath: path });
  return path;
}

export async function deleteChecklistCategory(id: string): Promise<void> {
  const { error } = await supabase.from('checklist_categories').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface CreateProductInput {
  categoryId: string;
  name: string;
  description?: string;
  affiliateUrl?: string;
  priceCents?: number | null;
  retailer?: string;
  published?: boolean;
  placeBuiltinKind?: string | null;
  placeCatalogKind?: string | null;
  placeHangingKind?: string | null;
  imagePath?: string | null;
  sortOrder?: number;
}

export async function createCuratedProduct(
  input: CreateProductInput,
  existingProducts: { sortOrder: number }[],
): Promise<string> {
  const sortOrder =
    input.sortOrder ??
    (existingProducts[existingProducts.length - 1]?.sortOrder ?? 0) + 10;

  const { data, error } = await supabase
    .from('curated_products')
    .insert({
      category_id: input.categoryId,
      slug: slugifyChecklist(input.name),
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      affiliate_url: input.affiliateUrl?.trim() ?? '',
      retailer: input.retailer?.trim() || 'Amazon',
      price_cents: input.priceCents ?? null,
      published: input.published ?? true,
      last_verified_at: new Date().toISOString(),
      place_builtin_kind: input.placeBuiltinKind || null,
      place_catalog_kind: input.placeCatalogKind || null,
      place_hanging_kind: input.placeHangingKind || null,
      image_path: input.imagePath ?? null,
      sort_order: sortOrder,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return String(data.id);
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  affiliateUrl?: string;
  priceCents?: number | null;
  retailer?: string;
  published?: boolean;
  placeBuiltinKind?: string | null;
  placeCatalogKind?: string | null;
  placeHangingKind?: string | null;
  imagePath?: string | null;
  categoryId?: string;
  sortOrder?: number;
}

export async function updateCuratedProduct(
  id: string,
  input: UpdateProductInput,
): Promise<void> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.name != null) {
    patch.name = input.name.trim();
    patch.slug = slugifyChecklist(input.name);
  }
  if (input.description != null) patch.description = input.description.trim();
  if (input.affiliateUrl != null) patch.affiliate_url = input.affiliateUrl.trim();
  if (input.priceCents !== undefined) patch.price_cents = input.priceCents;
  if (input.retailer != null) patch.retailer = input.retailer.trim() || 'Amazon';
  if (input.published != null) patch.published = input.published;
  if (input.placeBuiltinKind !== undefined) {
    patch.place_builtin_kind = input.placeBuiltinKind || null;
  }
  if (input.placeCatalogKind !== undefined) {
    patch.place_catalog_kind = input.placeCatalogKind || null;
  }
  if (input.placeHangingKind !== undefined) {
    patch.place_hanging_kind = input.placeHangingKind || null;
  }
  if (input.imagePath !== undefined) patch.image_path = input.imagePath;
  if (input.categoryId != null) patch.category_id = input.categoryId;
  if (input.sortOrder != null) patch.sort_order = input.sortOrder;

  const { error } = await supabase.from('curated_products').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteCuratedProduct(id: string): Promise<void> {
  const { error } = await supabase.from('curated_products').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function attachProductCoverImage(
  productId: string,
  file: File,
): Promise<string> {
  const path = await uploadProductCoverImage(file, productId);
  await updateCuratedProduct(productId, { imagePath: path });
  return path;
}

/** After model upload: create checklist product linked to furniture_catalog kind. */
export async function createChecklistProductFromCatalog(input: {
  categoryId: string;
  name: string;
  catalogKind: string;
  affiliateUrl?: string;
  priceCents?: number | null;
  coverFile?: File | null;
  description?: string;
}): Promise<string> {
  let imagePath: string | null = null;
  const productId = await createCuratedProduct(
    {
      categoryId: input.categoryId,
      name: input.name,
      description: input.description ?? '',
      affiliateUrl: input.affiliateUrl ?? '',
      priceCents: input.priceCents ?? null,
      placeCatalogKind: input.catalogKind,
      published: true,
    },
    [],
  );

  if (input.coverFile) {
    imagePath = await attachProductCoverImage(productId, input.coverFile);
  }

  return productId;
}

export async function createChecklistProductWithModel(input: {
  userId: string;
  categoryId: string;
  name: string;
  description?: string;
  affiliateUrl?: string;
  priceCents?: number | null;
  retailer?: string;
  published?: boolean;
  coverFile?: File | null;
  glbFile: File;
  widthIn: number;
  heightIn: number;
  depthIn: number;
  originalFileName?: string;
  existingProducts?: { sortOrder: number }[];
}): Promise<string> {
  const { kind } = await uploadCatalogModel({
    userId: input.userId,
    glbFile: input.glbFile,
    label: input.name.trim(),
    widthIn: input.widthIn,
    heightIn: input.heightIn,
    depthIn: input.depthIn,
    description: input.description ?? '',
    visibility: 'public',
    originalFileName: input.originalFileName,
  });

  const productId = await createCuratedProduct(
    {
      categoryId: input.categoryId,
      name: input.name.trim(),
      description: input.description ?? '',
      affiliateUrl: input.affiliateUrl ?? '',
      priceCents: input.priceCents ?? null,
      retailer: input.retailer ?? 'Amazon',
      placeCatalogKind: kind,
      published: input.published ?? true,
    },
    input.existingProducts ?? [],
  );

  if (input.coverFile) {
    await attachProductCoverImage(productId, input.coverFile);
  }

  return productId;
}

export async function updateChecklistProductWithModel(input: {
  productId: string;
  userId: string;
  name?: string;
  description?: string;
  affiliateUrl?: string;
  priceCents?: number | null;
  retailer?: string;
  published?: boolean;
  coverFile?: File | null;
  glbFile?: File | null;
  widthIn?: number;
  heightIn?: number;
  depthIn?: number;
  originalFileName?: string;
}): Promise<void> {
  const patch: UpdateProductInput = {};
  if (input.name != null) patch.name = input.name;
  if (input.description != null) patch.description = input.description;
  if (input.affiliateUrl != null) patch.affiliateUrl = input.affiliateUrl;
  if (input.priceCents !== undefined) patch.priceCents = input.priceCents;
  if (input.retailer != null) patch.retailer = input.retailer;
  if (input.published != null) patch.published = input.published;

  if (input.glbFile && input.widthIn && input.heightIn && input.depthIn) {
    const { kind } = await uploadCatalogModel({
      userId: input.userId,
      glbFile: input.glbFile,
      label: input.name?.trim() || 'Checklist item',
      widthIn: input.widthIn,
      heightIn: input.heightIn,
      depthIn: input.depthIn,
      description: input.description ?? '',
      visibility: 'public',
      originalFileName: input.originalFileName,
    });
    patch.placeCatalogKind = kind;
    patch.placeBuiltinKind = null;
  }

  if (Object.keys(patch).length > 0) {
    await updateCuratedProduct(input.productId, patch);
  }

  if (input.coverFile) {
    await attachProductCoverImage(input.productId, input.coverFile);
  }
}

export function nextSortOrder(items: { sortOrder: number }[]): number {
  return (items[items.length - 1]?.sortOrder ?? 0) + 10;
}

export function hasChildCategories(
  categories: ChecklistCategoryWithProducts[],
  categoryId: string,
): boolean {
  return childCategories(categories, categoryId).length > 0;
}
