/**
 * Resolve affiliate / shop links for room objects and curated products.
 * Exact matches only when a verified curated product is known.
 */

import type { CuratedProduct } from './dormChecklist';
import type { Item } from '../store';

export interface AffiliateOffer {
  label: string;
  url: string;
  /** True when this is a search / similarity fallback, not an exact product. */
  approximate: boolean;
  priceCents?: number | null;
  currency?: string;
  retailer?: string;
  productId?: string;
  imageUrl?: string | null;
  description?: string;
}

const BUILTIN_SEARCH_TERMS: Record<string, string> = {
  bed: 'twin dorm bed frame',
  dresser: 'dorm dresser',
  bookshelf: 'dorm bookshelf open shelf',
  shelf: 'floating wall shelf',
  wardrobe: 'dorm wardrobe closet',
  desk: 'dorm desk',
  chair: 'dorm desk chair',
  nightstand: 'nightstand',
  lamp: 'dorm desk lamp',
  imported: 'dorm furniture',
};

const DEFAULT_AMAZON_TAG = 'toova-20';

function amazonTag(): string {
  const tag = (import.meta.env.VITE_AMAZON_AFFILIATE_TAG as string | undefined)?.trim();
  return tag || DEFAULT_AMAZON_TAG;
}

export function amazonSearchUrl(query: string): string {
  const params = new URLSearchParams({ k: query });
  const tag = amazonTag();
  if (tag) params.set('tag', tag);
  return `https://www.amazon.com/s?${params.toString()}`;
}

export interface AmazonCartLine {
  asin: string;
  quantity: number;
  label?: string;
}

/** Amazon Cart API — adds multiple ASINs in one affiliate-tagged cart URL. */
export function amazonMultiAddCartUrl(lines: AmazonCartLine[]): string | null {
  const withAsin = lines.filter((l) => l.asin.trim().length === 10);
  if (withAsin.length === 0) return null;

  const params = new URLSearchParams();
  const tag = amazonTag();
  if (tag) params.set('AssociateTag', tag);

  withAsin.forEach((line, index) => {
    const n = index + 1;
    params.set(`ASIN.${n}`, line.asin.trim().toUpperCase());
    params.set(`Quantity.${n}`, String(Math.max(1, line.quantity)));
  });

  return `https://www.amazon.com/gp/aws/cart/add.html?${params.toString()}`;
}

export function parseAsinFromAffiliateUrl(url: string): string | null {
  const dp = url.match(/\/dp\/([A-Za-z0-9]{10})/i);
  if (dp?.[1]) return dp[1].toUpperCase();
  const gp = url.match(/\/gp\/product\/([A-Za-z0-9]{10})/i);
  if (gp?.[1]) return gp[1].toUpperCase();
  return null;
}

function sanitizeLabel(label: string | undefined | null): string {
  const cleaned = (label ?? '')
    .replace(/[^\w\s\-&.']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const lower = cleaned.toLowerCase();
  if (lower === 'model' || lower === 'imported' || lower.length < 3) return '';
  return cleaned;
}

/** Exact product page URL, or tagged Amazon search when the catalog link is missing. */
export function shopUrlForProduct(product: Pick<CuratedProduct, 'affiliateUrl' | 'name'>): {
  url: string;
  approximate: boolean;
  label: string;
} {
  const exact = product.affiliateUrl?.trim();
  if (exact) {
    return { url: exact, approximate: false, label: 'Shop' };
  }
  return {
    url: amazonSearchUrl(product.name || 'dorm essentials'),
    approximate: true,
    label: 'Find on Amazon',
  };
}

export function productAsin(product: Pick<CuratedProduct, 'asin' | 'affiliateUrl'>): string | null {
  const stored = product.asin?.trim();
  if (stored && stored.length === 10) return stored.toUpperCase();
  return parseAsinFromAffiliateUrl(product.affiliateUrl ?? '');
}

export function offerFromProduct(product: CuratedProduct): AffiliateOffer {
  const shop = shopUrlForProduct(product);
  return {
    label: shop.label,
    url: shop.url,
    approximate: shop.approximate,
    priceCents: product.priceCents,
    currency: product.currency,
    retailer: product.retailer,
    productId: product.id,
    imageUrl: product.imageUrl,
    description: product.description,
  };
}

export function resolveAffiliateForItem(
  item: Item,
  productsById?: Record<string, CuratedProduct>,
): AffiliateOffer[] {
  if (item.curatedProductId && productsById?.[item.curatedProductId]) {
    return [offerFromProduct(productsById[item.curatedProductId])];
  }

  const catalogKind = item.catalogKind?.trim();
  if (catalogKind && productsById) {
    const localMatch = Object.values(productsById).find(
      (p) => p.placeCatalogKind === catalogKind && p.affiliateUrl.trim(),
    );
    if (localMatch) return [offerFromProduct(localMatch)];
  }

  const kindTerm = BUILTIN_SEARCH_TERMS[item.kind] ?? 'dorm essentials';
  const label = sanitizeLabel(item.label);
  const query = label ? `${label} ${kindTerm}` : kindTerm;

  return [
    {
      label: 'Shop similar on Amazon',
      url: amazonSearchUrl(query),
      approximate: true,
      retailer: 'Amazon',
      description:
        'This room object is not linked to a verified Toova product. Results may not match exactly.',
    },
  ];
}

export function resolveAffiliateForKind(kind: string): AffiliateOffer {
  const term = BUILTIN_SEARCH_TERMS[kind] ?? `${kind} dorm`;
  return {
    label: 'Shop similar on Amazon',
    url: amazonSearchUrl(term),
    approximate: true,
    retailer: 'Amazon',
  };
}
