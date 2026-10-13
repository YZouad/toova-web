import { supabase } from './supabase';
import type { CuratedProduct } from './dormChecklist';

export interface BundleItemRow {
  product_id: string;
  quantity: number;
  sort_order: number;
  placement_preset: Record<string, unknown> | null;
  product: {
    id: string;
    name: string;
    affiliate_url: string;
    asin: string | null;
    retailer: string;
    price_cents: number | null;
    place_builtin_kind: string | null;
    place_catalog_kind: string | null;
  };
}

export interface ProductBundle {
  id: string;
  slug: string;
  title: string;
  description: string;
  hero_image_path: string | null;
  tags: string[];
  sort_order: number;
  items: BundleItemRow[];
}

export async function fetchPublishedBundles(): Promise<ProductBundle[]> {
  const { data, error } = await supabase.rpc('list_published_bundles');
  if (error) {
    console.error('list_published_bundles', error.message);
    return [];
  }
  return (data ?? []) as ProductBundle[];
}

export function bundleItemAsCuratedProduct(item: BundleItemRow): CuratedProduct {
  const p = item.product;
  return {
    id: p.id,
    categoryId: '',
    slug: p.id,
    name: p.name,
    description: '',
    retailer: p.retailer,
    affiliateUrl: p.affiliate_url,
    priceCents: p.price_cents,
    currency: 'USD',
    imagePath: null,
    imageUrl: null,
    sortOrder: item.sort_order,
    published: true,
    lastVerifiedAt: null,
    placeBuiltinKind: p.place_builtin_kind,
    placeCatalogKind: p.place_catalog_kind,
    placeHangingKind: null,
    placeBeddingKind: null,
    brand: null,
    featureBullets: [],
    dimensionsText: null,
    rating: null,
    reviewCount: null,
    availability: null,
  };
}
