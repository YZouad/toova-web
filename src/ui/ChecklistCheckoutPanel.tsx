import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  amazonMultiAddCartUrl,
  productAsin,
  shopUrlForProduct,
  type AmazonCartLine,
} from '../lib/affiliateLinks';
import { trackAffiliateClicked } from '../lib/analytics';
import { formatPriceCents } from '../lib/dormChecklist';
import type { PurchaseCartLine } from '../lib/purchaseCart';
import { purchaseCartTotalCents } from '../lib/purchaseCart';
import { Button } from './kit/Button';
import { Modal } from './kit/Modal';
import { MonoMeta } from './kit/MonoMeta';
import { RuledTable } from './kit/RuledTable';

function sourceLabel(source: PurchaseCartLine['source']): string {
  if (source === 'owned') return 'Already own';
  if (source === 'both') return 'List · In room';
  if (source === 'room') return 'In room';
  return 'On list';
}

interface ChecklistCheckoutPanelProps {
  lines: PurchaseCartLine[];
  onClose: () => void;
  onRemoveFromList: (productId: string) => void;
  /** Designer chrome instead of the marketing ledger modal. */
  variant?: 'page' | 'designer';
}

function isAmazonRetailer(retailer: string): boolean {
  return retailer.trim().toLowerCase() === 'amazon';
}

function trackShop(line: PurchaseCartLine) {
  trackAffiliateClicked({
    retailer: line.product.retailer,
    product_id: line.product.id,
    is_price_approximate: line.approximate,
    source: 'checklist_checkout',
  });
}

export function ChecklistCheckoutPanel({
  lines,
  onClose,
  onRemoveFromList,
  variant = 'page',
}: ChecklistCheckoutPanelProps) {
  const { sum, known } = useMemo(() => purchaseCartTotalCents(lines), [lines]);
  const totalLabel = formatPriceCents(sum) ?? '$0';

  const groups = useMemo(() => {
    const map = new Map<string, PurchaseCartLine[]>();
    for (const line of lines) {
      const key = line.product.retailer?.trim() || 'Shop';
      const group = map.get(key) ?? [];
      group.push(line);
      map.set(key, group);
    }
    return Array.from(map.entries());
  }, [lines]);

  const amazonCartUrl = useMemo(() => {
    const amazonLines: AmazonCartLine[] = [];
    for (const line of lines) {
      if (!isAmazonRetailer(line.product.retailer ?? '')) continue;
      const asin = productAsin(line.product);
      if (!asin) continue;
      amazonLines.push({
        asin,
        quantity: Math.max(1, line.quantity),
        label: line.product.name,
      });
    }
    return amazonMultiAddCartUrl(amazonLines);
  }, [lines]);

  const amazonItemCount = useMemo(
    () =>
      lines
        .filter((line) => isAmazonRetailer(line.product.retailer ?? ''))
        .filter((line) => productAsin(line.product))
        .reduce((n, line) => n + Math.max(1, line.quantity), 0),
    [lines],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (variant === 'designer') {
    return (
      <DesignerCheckout
        lines={lines}
        groups={groups}
        totalLabel={known ? totalLabel : `${totalLabel}+`}
        amazonCartUrl={amazonCartUrl}
        amazonItemCount={amazonItemCount}
        amazonApproximate={lines.some(
          (l) => isAmazonRetailer(l.product.retailer ?? '') && l.approximate,
        )}
        onClose={onClose}
        onRemoveFromList={onRemoveFromList}
      />
    );
  }

  return (
    <Modal
      open
      meta="Need to buy"
      title="Your shopping cart."
      onClose={onClose}
      width={720}
      footer={
        <Button size="sm" variant="outline" onClick={onClose}>
          Keep planning
        </Button>
      }
    >
      <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 16 }}>
        Items you added to your list or placed in your room. Open each shop link to purchase —
        retailers handle checkout.
      </MonoMeta>

      {lines.length === 0 ? (
        <p className="purchase-review-empty">
          Nothing to buy yet. Add picks to your list or place items in your room.
        </p>
      ) : (
        <>
          <div
            className="checklist-checkout-total"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 20,
              paddingBottom: 16,
              borderBottom: '1px solid var(--rule-soft)',
            }}
          >
            <MonoMeta size="xs" tone="dense" upper>
              Estimated total
            </MonoMeta>
            <span style={{ font: '500 24px/1 var(--font-serif)', color: 'var(--ink-0)' }}>
              {known ? totalLabel : `${totalLabel}+`}
            </span>
          </div>

          {amazonCartUrl ? (
            <div style={{ marginBottom: 20 }}>
              <a
                className="kit-btn kit-btn--primary kit-btn--md"
                href={amazonCartUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', width: '100%', justifyContent: 'center' }}
                onClick={() =>
                  trackAffiliateClicked({
                    retailer: 'Amazon',
                    is_price_approximate: lines.some(
                      (l) => isAmazonRetailer(l.product.retailer ?? '') && l.approximate,
                    ),
                    source: 'checklist_checkout_amazon_cart',
                  })
                }
              >
                Add all {amazonItemCount} to Amazon cart
              </a>
            </div>
          ) : null}

          {groups.map(([retailer, groupLines]) => (
            <div key={retailer} style={{ marginBottom: 24 }}>
              <MonoMeta size="xs" tone="dense" upper style={{ display: 'block', marginBottom: 10 }}>
                {retailer}
              </MonoMeta>
              <RuledTable
                columns={[
                  { label: 'Item' },
                  { label: 'Source', align: 'right' },
                  { label: 'Price', align: 'right' },
                  { label: '', align: 'right' },
                ]}
                rows={groupLines.map((line) => {
                  const price =
                    formatPriceCents(line.product.priceCents, line.product.currency) ?? '—';
                  const shop = shopUrlForProduct(line.product);
                  return [
                    <span key={`${line.productId}-name`}>
                      {line.product.name}
                      {line.approximate || shop.approximate ? (
                        <MonoMeta size="xs" tone="dense" style={{ display: 'block', marginTop: 4 }}>
                          {shop.approximate
                            ? 'Search match — confirm on Amazon'
                            : 'Best match for room placement'}
                        </MonoMeta>
                      ) : null}
                    </span>,
                    sourceLabel(line.source),
                    line.quantity > 1 ? `${price} ×${line.quantity}` : price,
                    <span
                      key={`${line.productId}-actions`}
                      style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}
                    >
                      <a
                        className="kit-btn kit-btn--primary kit-btn--sm"
                        href={shop.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          trackAffiliateClicked({
                            retailer: line.product.retailer,
                            product_id: line.product.id,
                            is_price_approximate: line.approximate || shop.approximate,
                            source: 'checklist_checkout',
                          })
                        }
                      >
                        {shop.label}
                      </a>
                      {line.source === 'list' || line.source === 'both' ? (
                        <button
                          type="button"
                          className="kit-btn kit-btn--sm kit-btn--outline"
                          onClick={() => onRemoveFromList(line.productId)}
                        >
                          Remove
                        </button>
                      ) : line.source === 'owned' ? (
                        <button
                          type="button"
                          className="kit-btn kit-btn--sm kit-btn--outline"
                          onClick={() => onRemoveFromList(line.productId)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </span>,
                  ];
                })}
              />
            </div>
          ))}
        </>
      )}

      <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginTop: 16 }}>
        As an Amazon Associate, Toova may earn from qualifying purchases. Prices may change.
      </MonoMeta>
    </Modal>
  );
}

function DesignerCheckout({
  lines,
  groups,
  totalLabel,
  amazonCartUrl,
  amazonItemCount,
  amazonApproximate,
  onClose,
  onRemoveFromList,
}: {
  lines: PurchaseCartLine[];
  groups: [string, PurchaseCartLine[]][];
  totalLabel: string;
  amazonCartUrl: string | null;
  amazonItemCount: number;
  amazonApproximate: boolean;
  onClose: () => void;
  onRemoveFromList: (productId: string) => void;
}) {
  const pressedOnScrim = useRef(false);

  function handleScrimMouseDown(e: MouseEvent<HTMLDivElement>) {
    pressedOnScrim.current = e.target === e.currentTarget;
  }

  function handleScrimClick(e: MouseEvent<HTMLDivElement>) {
    if (pressedOnScrim.current && e.target === e.currentTarget) onClose();
    pressedOnScrim.current = false;
  }

  return createPortal(
    <div
      className="dg-checkout-scrim"
      onMouseDown={handleScrimMouseDown}
      onClick={handleScrimClick}
      role="presentation"
    >
      <div
        className="dg-checkout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dg-checkout-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dg-checkout__head">
          <div className="dg-checkout__head-copy">
            <span className="dg-checkout__eyebrow">Need to buy</span>
            <h2 id="dg-checkout-title" className="dg-checkout__title">
              Shopping cart
            </h2>
          </div>
          <button type="button" className="dg-checkout__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="dg-checkout__body">
          {lines.length === 0 ? (
            <p className="dg-checkout__empty">
              Nothing to buy yet. Add picks to your list or place items in your room.
            </p>
          ) : (
            <>
              <div className="dg-checkout__total">
                <span>Estimated total</span>
                <strong>{totalLabel}</strong>
              </div>
              {groups.map(([retailer, groupLines]) => (
                <section key={retailer} className="dg-checkout__group">
                  <h3 className="dg-checkout__retailer">{retailer}</h3>
                  <ul className="dg-checkout__list">
                    {groupLines.map((line) => {
                      const price =
                        formatPriceCents(line.product.priceCents, line.product.currency) ?? '—';
                      const shop = shopUrlForProduct(line.product);
                      const canRemove =
                        line.source === 'list' || line.source === 'both' || line.source === 'owned';
                      const priceLabel = line.quantity > 1 ? `${price} ×${line.quantity}` : price;
                      return (
                        <li key={line.productId} className="dg-checkout__row">
                          <div className="dg-checkout__copy">
                            <span className="dg-checkout__name">{line.product.name}</span>
                            <div className="dg-checkout__sub">
                              <span className="dg-checkout__meta">
                                {sourceLabel(line.source)}
                                {line.approximate || shop.approximate ? ' · Best match' : ''}
                              </span>
                              {canRemove ? (
                                <button
                                  type="button"
                                  className="dg-checkout__remove"
                                  onClick={() => onRemoveFromList(line.productId)}
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <span className="dg-checkout__price">{priceLabel}</span>
                          <a
                            className="dg-checkout__shop"
                            href={shop.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => trackShop(line)}
                          >
                            {shop.label}
                            <span aria-hidden> ↗</span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              <p className="dg-checkout__note">
                As an Amazon Associate, Toova may earn from qualifying purchases. Prices may change.
              </p>
            </>
          )}
        </div>

        <footer className="dg-checkout__foot">
          {amazonCartUrl ? (
            <a
              className="dg-checkout__amazon"
              href={amazonCartUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackAffiliateClicked({
                  retailer: 'Amazon',
                  is_price_approximate: amazonApproximate,
                  source: 'checklist_checkout_amazon_cart',
                })
              }
            >
              Add all {amazonItemCount} to Amazon cart
            </a>
          ) : null}
          <button type="button" className="dg-checkout__dismiss" onClick={onClose}>
            Keep planning
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
