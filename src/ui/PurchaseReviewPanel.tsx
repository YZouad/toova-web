import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CuratedProduct, ShoppingListEntry } from '../lib/dormChecklist';
import { formatPriceCents } from '../lib/dormChecklist';

interface Line {
  entry: ShoppingListEntry;
  product: CuratedProduct;
}

interface PurchaseReviewPanelProps {
  lines: Line[];
  onClose: () => void;
  onMarkDone: (productId: string, done: boolean) => void;
}

export function PurchaseReviewPanel({
  lines,
  onClose,
  onMarkDone,
}: PurchaseReviewPanelProps) {
  const groups = useMemo(() => {
    const map = new Map<string, Line[]>();
    for (const line of lines) {
      const key = line.product.retailer || 'Retailer';
      const list = map.get(key) ?? [];
      list.push(line);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [lines]);

  const flat = useMemo(() => lines, [lines]);
  const [index, setIndex] = useState(0);
  const current = flat[Math.min(index, Math.max(0, flat.length - 1))] ?? null;
  const doneCount = flat.filter((l) => l.entry.reviewDone).length;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="purchase-review-backdrop" role="presentation" onClick={onClose}>
      <div
        className="purchase-review"
        role="dialog"
        aria-modal="true"
        aria-label="Review purchases"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="purchase-review-head">
          <div>
            <p className="purchase-review-eyebrow">Guided checkout</p>
            <h2 className="purchase-review-title">Review purchases</h2>
            <p className="purchase-review-copy">
              Retailers control their own carts. Open each link, then mark it done when you are
              finished shopping that item.
            </p>
          </div>
          <button type="button" className="product-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="purchase-review-progress" aria-live="polite">
          {doneCount} of {flat.length} marked done
        </div>

        {current ? (
          <div className="purchase-review-current">
            <div className="purchase-review-media" aria-hidden>
              {current.product.imageUrl ? (
                <img src={current.product.imageUrl} alt="" />
              ) : (
                <span>{current.product.name.slice(0, 1)}</span>
              )}
            </div>
            <div>
              <h3>{current.product.name}</h3>
              <p>
                {formatPriceCents(current.product.priceCents, current.product.currency) ??
                  'Price varies'}{' '}
                · ×{current.entry.quantity} · {current.product.retailer}
              </p>
              <div className="purchase-review-actions">
                <a
                  className="tv-btn-primary"
                  href={current.product.affiliateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open shop
                </a>
                <button
                  type="button"
                  className="tv-btn-ghost product-drawer-btn"
                  onClick={() => onMarkDone(current.product.id, !current.entry.reviewDone)}
                >
                  {current.entry.reviewDone ? 'Undo done' : 'Mark done'}
                </button>
              </div>
              <div className="purchase-review-nav">
                <button
                  type="button"
                  className="tv-btn-ghost product-drawer-btn"
                  disabled={index <= 0}
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="tv-btn-ghost product-drawer-btn"
                  disabled={index >= flat.length - 1}
                  onClick={() => setIndex((i) => Math.min(flat.length - 1, i + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="purchase-review-empty">Your list is empty.</p>
        )}

        <div className="purchase-review-groups">
          {groups.map(([retailer, groupLines]) => (
            <section key={retailer}>
              <h4>{retailer}</h4>
              <ul>
                {groupLines.map(({ entry, product }) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      className={entry.reviewDone ? 'is-done' : undefined}
                      onClick={() =>
                        setIndex(flat.findIndex((l) => l.product.id === product.id))
                      }
                    >
                      {product.name}
                      {entry.reviewDone ? ' ✓' : ''}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="purchase-review-disclaimer">
          As an Amazon Associate, Toova may earn from qualifying purchases. Toova does not process
          payments or control retailer pricing.
        </p>
      </div>
    </div>,
    document.body,
  );
}
