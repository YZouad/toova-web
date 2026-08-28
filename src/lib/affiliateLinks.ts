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

function amazonTag(): string | undefined {
  const tag = (import.meta.env.VITE_AMAZON_AFFILIATE_TAG as string | undefined)?.trim();
  return tag || undefined;
}

export function amazonSearchUrl(query: string): string {
  const params = new URLSearchParams({ k: query });
  const tag = amazonTag();
  if (tag) params.set('tag', tag);
  return `https://www.amazon.com/s?${params.toString()}`;
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

export function offerFromProduct(product: CuratedProduct): AffiliateOffer {
  return {
    label: 'Shop',
    url: product.affiliateUrl,
    approximate: false,
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
