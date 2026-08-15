import { useMemo, useState } from 'react';
import { useStore, type Item } from '../store';
import type { CuratedProduct } from '../lib/dormChecklist';
import { formatPriceCents } from '../lib/dormChecklist';
import { resolveAffiliateForItem } from '../lib/affiliateLinks';
import { trackAffiliateClick } from '../lib/analytics';
import { useShoppingCatalogContext } from '../context/ShoppingCatalogContext';
import { Badge, Button, DisplayHeading, MonoMeta } from './kit';

interface SharedToBuyPanelProps {
  productsById: Record<string, CuratedProduct>;
}

interface GroupedRow {
  key: string;
  label: string;
  count: number;
  itemIds: string[];
  sample: Item;
}

const panelStyle = {
  background: 'var(--bg-raised)',
  border: '1px solid var(--rule-soft)',
  boxShadow: 'var(--shadow-panel)',
} as const;

export function SharedToBuyPanel({ productsById }: SharedToBuyPanelProps) {
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const select = useStore((s) => s.select);
  const { addToList } = useShoppingCatalogContext();
  const [expanded, setExpanded] = useState(true);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const rows = useMemo((): GroupedRow[] => {
    const map = new Map<string, GroupedRow>();
    for (const id of order) {
      const item = items[id];
      if (!item) continue;
      const identity =
        item.curatedProductId
        ?? (item.kind === 'imported' ? `imp:${item.importedStoragePath ?? item.label}` : `kind:${item.kind}:${item.label}`);
      const existing = map.get(identity);
      if (existing) {
        existing.count += 1;
        existing.itemIds.push(id);
      } else {
        map.set(identity, {
          key: identity,
          label: item.label?.trim() || item.kind,
          count: 1,
          itemIds: [id],
          sample: item,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [items, order]);

  const active = rows.find((r) => r.key === activeKey) ?? null;
  const offers = active
    ? resolveAffiliateForItem(active.sample, productsById)
    : [];

  return (
    <div className="scene-checkout shared-tobuy" style={panelStyle}>
      <button
        type="button"
        className="scene-checkout-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <DisplayHeading level={6} as="span" className="scene-checkout-title">
          To buy
        </DisplayHeading>
        <Badge tone="accent">{order.length}</Badge>
        <span className="scene-checkout-chevron" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded ? (
        <div className="scene-checkout-body">
          {rows.length === 0 ? (
            <MonoMeta size="sm" tone="dense" className="scene-checkout-empty">
              This room has no items yet.
            </MonoMeta>
          ) : (
            <ul className="scene-checkout-list">
              {rows.map((row) => (
                <li key={row.key}>
                  <button
                    type="button"
                    className={`scene-checkout-row scene-checkout-row--click${activeKey === row.key ? ' is-active' : ''}`}
                    onClick={() => {
                      setActiveKey(row.key);
                      select(row.itemIds[0] ?? null);
                    }}
                  >
                    <span className="scene-checkout-label">{row.label}</span>
                    <MonoMeta size="xs" tone="dense" className="scene-checkout-qty">×{row.count}</MonoMeta>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {active ? (
            <div className="shared-tobuy-detail">
              <DisplayHeading level={6} as="div">{active.label}</DisplayHeading>
              {offers.map((offer) => (
                <div key={offer.url} className="shared-tobuy-offer">
                  {!offer.approximate && offer.priceCents != null ? (
                    <MonoMeta size="sm" tone="dense" className="shared-tobuy-price">
                      {formatPriceCents(offer.priceCents, offer.currency) ?? ''}
                    </MonoMeta>
                  ) : null}
                  {offer.approximate ? (
                    <MonoMeta size="sm" tone="dense" className="shared-tobuy-approx">
                      Not a verified Toova product — results may not match this object.
                    </MonoMeta>
                  ) : null}
                  {offer.description && !offer.approximate ? (
                    <MonoMeta size="sm" tone="dense" className="shared-tobuy-desc">
                      {offer.description}
                    </MonoMeta>
                  ) : null}
                  <a
                    className="kit-btn kit-btn--primary kit-btn--sm"
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackAffiliateClick({
                        retailer: offer.retailer,
                        product_id: offer.productId,
                        approximate: offer.approximate,
                        source: 'shared_tobuy',
                      })
                    }
                  >
                    {offer.label}
                  </a>
                  {offer.productId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void addToList(offer.productId!)}
                    >
                      Add to my list
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <MonoMeta size="sm" tone="dense" className="scene-checkout-empty">
              Select an item to shop similar or exact picks.
            </MonoMeta>
          )}

          <MonoMeta size="xs" tone="dense" className="scene-checkout-affiliate">
            As an Amazon Associate, Toova may earn from qualifying purchases.
          </MonoMeta>
        </div>
      ) : null}
    </div>
  );
}
