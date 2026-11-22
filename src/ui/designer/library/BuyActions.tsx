import type { CuratedProduct } from '../../../lib/dormChecklist';
import { formatPriceCents } from '../../../lib/dormChecklist';
import { shopUrlForProduct } from '../../../lib/affiliateLinks';
import { trackAffiliateClicked } from '../../../lib/analytics';

function formatVerifiedDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(t);
  } catch {
    return null;
  }
}

export interface BuyActionsProps {
  product: CuratedProduct;
  compact?: boolean;
  onSaved?: () => void;
  addToList: (productId: string) => void;
}

export function PriceTag({
  product,
  compact,
}: {
  product: CuratedProduct;
  compact?: boolean;
}) {
  const price = formatPriceCents(product.priceCents, product.currency);
  const verified = formatVerifiedDate(product.lastVerifiedAt);
  if (!price && !product.retailer) return null;
  return (
    <span className={`dgl-price${compact ? ' dgl-price--compact' : ''}`}>
      {price ? <span className="dgl-price__amount">{price}</span> : null}
      {product.retailer ? (
        <span className="dgl-price__retailer">
          {price ? ' at ' : ''}
          {product.retailer}
        </span>
      ) : null}
      {verified && !compact ? (
        <span className="dgl-price__verified">Price checked {verified}</span>
      ) : null}
    </span>
  );
}

export function BuyActions({
  product,
  compact,
  onSaved,
  addToList,
}: BuyActionsProps) {
  const shop = shopUrlForProduct(product);

  const buy = () => {
    trackAffiliateClicked({
      retailer: product.retailer,
      product_id: product.id,
      is_price_approximate: shop.approximate,
      source: 'designer_library',
      variant: 'showroom',
    });
    window.open(shop.url, '_blank', 'noopener,noreferrer');
  };

  const save = () => {
    addToList(product.id);
    onSaved?.();
  };

  return (
    <div className={`dgl-buy${compact ? ' dgl-buy--compact' : ''}`}>
      <PriceTag product={product} compact={compact} />
      <div className="dgl-buy__actions">
        <button type="button" className="dgl-btn dgl-btn--accent" onClick={buy}>
          {shop.approximate ? 'Find' : 'Buy'} on {product.retailer || 'retailer'}
        </button>
        <button type="button" className="dgl-btn" onClick={save}>
          Save to list
        </button>
      </div>
    </div>
  );
}
