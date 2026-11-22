import { useEffect, useId, useRef, useState } from 'react';
import type { CuratedProduct } from '../../../lib/dormChecklist';
import { formatPriceCents } from '../../../lib/dormChecklist';
import {
  amazonMultiAddCartUrl,
  productAsin,
} from '../../../lib/affiliateLinks';
import { trackAffiliateClicked } from '../../../lib/analytics';
import type { PurchaseCartLine } from '../../../lib/purchaseCart';
import { purchaseCartTotalCents } from '../../../lib/purchaseCart';
import { PriceTag } from './BuyActions';

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

export function ShopRoomBar({
  lines,
  hasBudget,
  onSetBudget,
  removeFromList,
}: {
  lines: PurchaseCartLine[];
  hasBudget: boolean;
  onSetBudget?: () => void;
  removeFromList?: (productId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const total = purchaseCartTotalCents(lines);
  const totalLabel =
    total.known && total.sum > 0
      ? formatPriceCents(total.sum, lines[0]?.product.currency ?? 'USD')
      : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target;
      if (t instanceof Node && rootRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  // Hidden when empty — budget link lives in the footer when shoppable pieces exist.
  if (lines.length === 0) return null;

  const openCart = () => {
    const cartLines = lines
      .map((l) => {
        const asin = productAsin(l.product);
        return asin ? { asin, quantity: l.quantity } : null;
      })
      .filter((x): x is { asin: string; quantity: number } => !!x);
    const url = amazonMultiAddCartUrl(cartLines);
    if (!url) return;
    trackAffiliateClicked({
      retailer: 'Amazon',
      is_price_approximate: false,
      source: 'designer_library',
      variant: 'showroom',
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const canAmazon = lines.some((l) => !!productAsin(l.product));

  return (
    <div className="dgl-shop-bar" ref={rootRef} role="status">
      <span className="dgl-shop-bar__summary">
        Shop this room: {lines.length} piece{lines.length === 1 ? '' : 's'}
        {totalLabel ? ` · ~${totalLabel}` : ''}
      </span>
      <button
        type="button"
        className="dgl-btn"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide' : 'Review'}
      </button>
      {open ? (
        <div id={panelId} className="dgl-shop-bar__panel" role="region" aria-label="Shopping list review">
          <div className="dgl-shop-bar__head">
            <span className="dgl-shop-bar__head-title">
              Shopping list ({lines.length})
            </span>
            <button
              type="button"
              className="dgl-shop-bar__close"
              aria-label="Close shopping list"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <ul className="dgl-shop-bar__list">
            {lines.map((line) => (
              <ShopLine
                key={line.productId}
                product={line.product}
                quantity={line.quantity}
                onRemove={
                  removeFromList
                    ? () => removeFromList(line.productId)
                    : undefined
                }
              />
            ))}
          </ul>
          <div className="dgl-shop-bar__actions">
            <button
              type="button"
              className="dgl-btn dgl-btn--accent"
              disabled={!canAmazon}
              onClick={openCart}
              title={canAmazon ? 'Opens Amazon with these items' : 'No Amazon ASINs available'}
            >
              Open Amazon cart
            </button>
            {!hasBudget && onSetBudget ? (
              <button type="button" className="dgl-btn" onClick={onSetBudget}>
                Set a budget
              </button>
            ) : null}
          </div>
          <p className="dgl-muted" style={{ margin: 0 }}>
            Review first — nothing is added until you open the cart.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ShopLine({
  product,
  quantity,
  onRemove,
}: {
  product: CuratedProduct;
  quantity: number;
  onRemove?: () => void;
}) {
  const price = formatPriceCents(product.priceCents, product.currency);
  const verified = formatVerifiedDate(product.lastVerifiedAt);
  return (
    <li className="dgl-shop-bar__line">
      <div className="dgl-shop-bar__line-main">
        <span className="dgl-shop-bar__name">
          {product.name}
          {quantity > 1 ? ` ×${quantity}` : ''}
        </span>
        {onRemove ? (
          <button type="button" className="dgl-shop-bar__remove" onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>
      <span className="dgl-shop-bar__meta">
        {price ? (
          <PriceTag product={product} compact />
        ) : (
          <span className="dgl-muted">price at {product.retailer || 'retailer'}</span>
        )}
        {verified ? <span className="dgl-muted"> · checked {verified}</span> : null}
      </span>
    </li>
  );
}
