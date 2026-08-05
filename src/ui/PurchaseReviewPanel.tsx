import { useEffect, useMemo, useState } from 'react';
import type { CuratedProduct, ShoppingListEntry } from '../lib/dormChecklist';
import { formatPriceCents } from '../lib/dormChecklist';
import { Button } from './kit/Button';
import { Modal } from './kit/Modal';
import { MonoMeta } from './kit/MonoMeta';
import { RuledTable } from './kit/RuledTable';

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Modal
      open
      meta="Review purchase"
      title="Guided checkout."
      onClose={onClose}
      width={720}
      footer={
        <Button size="sm" variant="outline" onClick={onClose}>
          Keep designing
        </Button>
      }
    >
      <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 16 }}>
        Retailers control their own carts. Open each link, then mark it done when you finish that item.
      </MonoMeta>

      <MonoMeta size="sm" tone="dense" upper style={{ display: 'block', marginBottom: 20 }} aria-live="polite">
        {doneCount} of {flat.length} marked done
      </MonoMeta>

      {current ? (
        <div className="purchase-review-current" style={{ marginBottom: 24 }}>
          <div className="purchase-review-media" aria-hidden>
            {current.product.imageUrl ? (
              <img src={current.product.imageUrl} alt="" />
            ) : (
              <span>{current.product.name.slice(0, 1)}</span>
            )}
          </div>
          <div>
            <h3 style={{ font: 'var(--type-h5)', margin: '0 0 8px' }}>{current.product.name}</h3>
            <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 16 }}>
              {formatPriceCents(current.product.priceCents, current.product.currency) ??
                'Price varies'}{' '}
              · ×{current.entry.quantity} · {current.product.retailer}
            </MonoMeta>
            <div className="purchase-review-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a
                className="kit-btn kit-btn--primary kit-btn--sm"
                href={current.product.affiliateUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open shop
              </a>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onMarkDone(current.product.id, !current.entry.reviewDone)}
              >
                {current.entry.reviewDone ? 'Undo done' : 'Mark done'}
              </Button>
            </div>
            <div className="purchase-review-nav" style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <Button size="sm" variant="outline" disabled={index <= 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={index >= flat.length - 1} onClick={() => setIndex((i) => Math.min(flat.length - 1, i + 1))}>
                Next
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="purchase-review-empty">Your list is empty.</p>
      )}

      {groups.map(([retailer, groupLines]) => (
        <div key={retailer} style={{ marginBottom: 20 }}>
          <MonoMeta size="xs" tone="dense" upper style={{ display: 'block', marginBottom: 10 }}>
            {retailer}
          </MonoMeta>
          <RuledTable
            columns={[{ label: 'Item' }, { label: 'Qty', align: 'right' }, { label: 'Status', align: 'right' }]}
            rows={groupLines.map(({ entry, product }) => [
              <button
                key={product.id}
                type="button"
                className={entry.reviewDone ? 'is-done' : undefined}
                onClick={() => setIndex(flat.findIndex((l) => l.product.id === product.id))}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left' }}
              >
                {product.name}
              </button>,
              String(entry.quantity),
              entry.reviewDone ? '✓' : '—',
            ])}
          />
        </div>
      ))}

      <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginTop: 16 }}>
        As an Amazon Associate, Toova may earn from qualifying purchases. Toova does not process
        payments or control retailer pricing.
      </MonoMeta>
    </Modal>
  );
}
