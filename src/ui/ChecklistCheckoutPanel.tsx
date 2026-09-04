import { useEffect, useMemo } from 'react';
import { trackAffiliateClicked } from '../lib/analytics';
import { formatPriceCents } from '../lib/dormChecklist';
import type { PurchaseCartLine } from '../lib/purchaseCart';
import { purchaseCartTotalCents } from '../lib/purchaseCart';
import { Button } from './kit/Button';
import { Modal } from './kit/Modal';
import { MonoMeta } from './kit/MonoMeta';
import { RuledTable } from './kit/RuledTable';

function sourceLabel(source: PurchaseCartLine['source']): string {
  if (source === 'both') return 'List · In room';
  if (source === 'room') return 'In room';
  return 'On list';
}

interface ChecklistCheckoutPanelProps {
  lines: PurchaseCartLine[];
  onClose: () => void;
  onRemoveFromList: (productId: string) => void;
}

export function ChecklistCheckoutPanel({
  lines,
  onClose,
  onRemoveFromList,
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
                  const shopUrl = line.product.affiliateUrl?.trim();
                  return [
                    <span key={`${line.productId}-name`}>
                      {line.product.name}
                      {line.approximate ? (
                        <MonoMeta size="xs" tone="dense" style={{ display: 'block', marginTop: 4 }}>
                          Best match for room placement
                        </MonoMeta>
                      ) : null}
                    </span>,
                    sourceLabel(line.source),
                    line.quantity > 1 ? `${price} ×${line.quantity}` : price,
                    <span
                      key={`${line.productId}-actions`}
                      style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}
                    >
                      {shopUrl ? (
                        <a
                          className="kit-btn kit-btn--primary kit-btn--sm"
                          href={shopUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            trackAffiliateClicked({
                              retailer: line.product.retailer,
                              product_id: line.product.id,
                              is_price_approximate: line.approximate,
                              source: 'checklist_checkout',
                            })
                          }
                        >
                          Shop
                        </a>
                      ) : null}
                      {line.source === 'list' || line.source === 'both' ? (
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
