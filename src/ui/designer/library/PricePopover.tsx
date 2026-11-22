import type { ReactNode } from 'react';
import type { CuratedProduct } from '../../../lib/dormChecklist';
import { formatPriceCents } from '../../../lib/dormChecklist';
import { shopUrlForProduct } from '../../../lib/affiliateLinks';
import { trackAffiliateClicked } from '../../../lib/analytics';
import type { BudgetFit } from './showroomSignals';

function significantWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2),
  );
}

/** True when product and model labels share at least one meaningful word. */
export function productMatchesModelLabel(productName: string, modelLabel: string): boolean {
  const a = significantWords(productName);
  const b = significantWords(modelLabel);
  if (a.size === 0 || b.size === 0) return true;
  for (const w of a) {
    if (b.has(w)) return true;
  }
  return false;
}

/** Direct retailer link for showroom cards (no clipped popover). */
export function CardPriceLink({
  product,
  budget,
  addToList,
  modelLabel,
  compact,
}: {
  product: CuratedProduct;
  budget: BudgetFit;
  addToList: (productId: string) => void;
  modelLabel?: string;
  /** Rail: price only (or "Price ›"), retailer in tooltip. */
  compact?: boolean;
}) {
  const price = formatPriceCents(product.priceCents, product.currency);
  const shop = shopUrlForProduct(product);
  const similar =
    modelLabel != null && !productMatchesModelLabel(product.name, modelLabel);
  const retailer = product.retailer || 'retailer';

  const onShopClick = () => {
    trackAffiliateClicked({
      retailer: product.retailer,
      product_id: product.id,
      is_price_approximate: shop.approximate,
      source: 'designer_library',
      variant: 'showroom',
    });
  };

  const linkTitle = similar
    ? product.name
    : compact
      ? `${price ? `${price} at ` : ''}${retailer}`
      : undefined;

  let linkBody: ReactNode;
  if (compact) {
    linkBody = price ? (
      <span className="dgl-price__amount">{price}</span>
    ) : (
      <span className="dgl-price__retailer">Price ›</span>
    );
  } else if (similar) {
    linkBody = (
      <span className="dgl-price__retailer">Similar at {retailer} ›</span>
    );
  } else if (price) {
    linkBody = (
      <>
        <span className="dgl-price__amount">{price}</span>
        {product.retailer ? (
          <span className="dgl-price__retailer"> at {product.retailer}</span>
        ) : null}
      </>
    );
  } else {
    linkBody = (
      <span className="dgl-price__retailer">Price at {retailer} ›</span>
    );
  }

  return (
    <div className={`dgl-price-wrap${compact ? ' dgl-price-wrap--compact' : ''}`}>
      <a
        className="dgl-price-pill"
        href={shop.url}
        target="_blank"
        rel="noopener noreferrer sponsored"
        title={linkTitle}
        onClick={(e) => {
          e.stopPropagation();
          onShopClick();
        }}
      >
        {linkBody}
        {!compact && budget.kind === 'over' ? (
          <span className="dgl-price__budget is-over"> · {budget.overLabel} over budget</span>
        ) : null}
      </a>
      <button
        type="button"
        className="dgl-price-save"
        aria-label={`Save ${product.name} to list`}
        title="Save to list"
        onClick={(e) => {
          e.stopPropagation();
          addToList(product.id);
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 4h12v17l-6-3.5L6 21V4z" />
        </svg>
      </button>
    </div>
  );
}

/** @deprecated Prefer CardPriceLink — kept name for import stability during pass 2. */
export const PricePopover = CardPriceLink;
