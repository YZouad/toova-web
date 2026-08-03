import { useMemo, useState } from 'react';
import { useStore, type Item } from '../store';
import type { CuratedProduct } from '../lib/dormChecklist';
import { formatPriceCents } from '../lib/dormChecklist';
import { resolveAffiliateForItem } from '../lib/affiliateLinks';
import { useShoppingCatalogContext } from '../context/ShoppingCatalogContext';
import { GlassSurface } from './GlassSurface';

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
    <GlassSurface compact className="scene-checkout shared-tobuy">
      <button
        type="button"
        className="scene-checkout-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="scene-checkout-title">To buy</span>
        <span className="scene-checkout-badge">{order.length}</span>
        <span className="scene-checkout-chevron" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded ? (
        <div className="scene-checkout-body">
          {rows.length === 0 ? (
            <p className="scene-checkout-empty">This room has no items yet.</p>
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
                    <span className="scene-checkout-qty">×{row.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {active ? (
            <div className="shared-tobuy-detail">
              <h3>{active.label}</h3>
              {offers.map((offer) => (
                <div key={offer.url} className="shared-tobuy-offer">
                  {!offer.approximate && offer.priceCents != null ? (
                    <p className="shared-tobuy-price">
                      {formatPriceCents(offer.priceCents, offer.currency) ?? ''}
                    </p>
                  ) : null}
                  {offer.approximate ? (
                    <p className="shared-tobuy-approx">
                      Not a verified Toova product — results may not match this object.
                    </p>
                  ) : null}
                  {offer.description && !offer.approximate ? (
                    <p className="shared-tobuy-desc">{offer.description}</p>
                  ) : null}
                  <a
                    className="tv-btn-primary"
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {offer.label}
                  </a>
                  {offer.productId ? (
                    <button
                      type="button"
                      className="tv-btn-ghost product-drawer-btn"
                      onClick={() => void addToList(offer.productId!)}
                    >
                      Add to my list
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="scene-checkout-empty">Select an item to shop similar or exact picks.</p>
          )}

          <p className="scene-checkout-affiliate">
            As an Amazon Associate, Toova may earn from qualifying purchases.
          </p>
        </div>
      ) : null}
    </GlassSurface>
  );
}
