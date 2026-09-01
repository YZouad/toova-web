import { useMemo, useState } from 'react';
import { useShoppingCatalogContext } from '../../../context/ShoppingCatalogContext';
import { useAuth } from '../../../hooks/useAuth';
import { trackAffiliateClick } from '../../../lib/analytics';
import { productHasPlaceableModel } from '../../../lib/checklistPublicGlbs';
import {
  categoryIdsSatisfiedByPlacements,
  formatPriceCents,
  leafCategories,
  type CuratedProduct,
} from '../../../lib/dormChecklist';
import { downloadCatalogModelByKind } from '../../../lib/modelStorage';
import {
  findRoomItemForProduct,
  placeCuratedProduct,
} from '../../../lib/placeCuratedProduct';
import { useStore } from '../../../store';
import { MobileSheet } from './MobileSheet';

type ChecklistTab = 'todo' | 'placed' | 'all';
type DetailSort = 'popular' | 'price';
type PriceDir = 'asc' | 'desc';

interface ChecklistLine {
  categoryId: string;
  name: string;
  products: CuratedProduct[];
  optionCount: number;
  fromPriceCents: number | null;
  currency: string;
  quantity: number;
  placed: boolean;
  groupId: string;
  groupName: string;
  groupOrder: number;
  sortOrder: number;
}

interface ChecklistGroup {
  id: string;
  name: string;
  order: number;
  placed: number;
  total: number;
  lines: ChecklistLine[];
}

export interface MobileChecklistSheetProps {
  onClose: () => void;
  itemId: string | null;
  onOpenItem: (id: string) => void;
  onCloseItem: () => void;
}

function ProgressRing({ pct, size = 40 }: { pct: number; size?: number }) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * c;
  return (
    <svg className="dgm-progress-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-4)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="var(--ink-2)"
        style={{ font: '500 10px/1 var(--font-serif)' }}
      >
        {clamped}%
      </text>
    </svg>
  );
}

function publishedProducts(products: CuratedProduct[]): CuratedProduct[] {
  const published = products.filter((p) => p.published);
  return published.length > 0 ? published : products;
}

function lowestPriceCents(products: CuratedProduct[]): number | null {
  let min: number | null = null;
  for (const p of products) {
    if (p.priceCents == null) continue;
    if (min == null || p.priceCents < min) min = p.priceCents;
  }
  return min;
}

function optionsLabel(count: number, fromCents: number | null, currency: string): string {
  if (count <= 0) return 'Options coming soon';
  const from = formatPriceCents(fromCents, currency);
  if (count === 1) return from ? `1 option · ${from}` : '1 option';
  return from ? `${count} options from ${from}` : `${count} options`;
}

function vendorLine(product: CuratedProduct): string {
  const retailer = product.retailer?.trim() || 'Shop';
  const avail = product.availability?.trim();
  return avail ? `${retailer} · ${avail}` : retailer;
}

function productBadges(
  product: CuratedProduct,
  products: CuratedProduct[],
  inRoom: boolean,
): string[] {
  if (inRoom) return ['In room'];
  const badges: string[] = [];
  const priced = products.filter((p) => p.priceCents != null);
  const cheapest = priced.reduce<CuratedProduct | null>(
    (best, p) => (!best || (p.priceCents ?? Infinity) < (best.priceCents ?? Infinity) ? p : best),
    null,
  );
  if (cheapest?.id === product.id) badges.push('Best value');
  const featured = [...products].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  if (featured?.id === product.id && featured.id !== cheapest?.id) badges.push('Most placed');
  return badges;
}

export function MobileChecklistSheet({
  onClose,
  itemId,
  onOpenItem,
  onCloseItem,
}: MobileChecklistSheetProps) {
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const select = useStore((s) => s.select);
  const removeItem = useStore((s) => s.removeItem);
  const { categories, categoriesById, list, addToList } = useShoppingCatalogContext();
  const { user } = useAuth();
  const canDownloadGlb = !!user?.id;

  const [tab, setTab] = useState<ChecklistTab>('todo');
  const [detailSort, setDetailSort] = useState<DetailSort>('popular');
  const [priceDir, setPriceDir] = useState<PriceDir>('asc');
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [downloadKind, setDownloadKind] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const listQty = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of list) map.set(entry.productId, entry.quantity);
    return map;
  }, [list]);

  const placedCategoryIds = useMemo(() => {
    const placements = order
      .map((id) => items[id])
      .filter((item): item is NonNullable<typeof item> => item != null)
      .map((item) => ({
        kind: item.kind,
        curatedProductId: item.curatedProductId,
      }));
    return categoryIdsSatisfiedByPlacements(categories, placements);
  }, [categories, items, order]);

  const lines = useMemo((): ChecklistLine[] => {
    const leaves = leafCategories(categories).filter((c) => c.published);
    const out: ChecklistLine[] = [];
    for (const cat of leaves) {
      const parent = cat.parentId ? categoriesById[cat.parentId] : null;
      const group = parent ?? cat;
      const products = publishedProducts(cat.products);
      let quantity = 1;
      for (const p of products) {
        const q = listQty.get(p.id);
        if (q != null) {
          quantity = q;
          break;
        }
      }
      out.push({
        categoryId: cat.id,
        name: cat.name,
        products,
        optionCount: products.length,
        fromPriceCents: lowestPriceCents(products),
        currency: products.find((p) => p.priceCents != null)?.currency ?? 'USD',
        quantity,
        placed: placedCategoryIds.has(cat.id),
        groupId: group.id,
        groupName: group.name,
        groupOrder: group.sortOrder,
        sortOrder: cat.sortOrder,
      });
    }
    return out.sort(
      (a, b) =>
        a.groupOrder - b.groupOrder ||
        a.groupName.localeCompare(b.groupName) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name),
    );
  }, [categories, categoriesById, listQty, placedCategoryIds]);

  const placedCount = lines.filter((l) => l.placed).length;
  const todoCount = lines.filter((l) => !l.placed).length;
  const totalCount = lines.length;
  const progressPct = totalCount === 0 ? 0 : Math.round((placedCount / totalCount) * 100);

  const visibleLines = useMemo(() => {
    if (tab === 'todo') return lines.filter((l) => !l.placed);
    if (tab === 'placed') return lines.filter((l) => l.placed);
    return lines;
  }, [lines, tab]);

  const groups = useMemo((): ChecklistGroup[] => {
    const map = new Map<string, ChecklistGroup>();
    for (const line of visibleLines) {
      let g = map.get(line.groupId);
      if (!g) {
        const allInGroup = lines.filter((l) => l.groupId === line.groupId);
        g = {
          id: line.groupId,
          name: line.groupName,
          order: line.groupOrder,
          placed: allInGroup.filter((l) => l.placed).length,
          total: allInGroup.length,
          lines: [],
        };
        map.set(line.groupId, g);
      }
      g.lines.push(line);
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [visibleLines, lines]);

  const activeLine = itemId ? lines.find((l) => l.categoryId === itemId) ?? null : null;

  const placementCountByProductId = useMemo(() => {
    const counts = new Map<string, number>();
    if (!activeLine) return counts;
    for (const product of activeLine.products) {
      let n = 0;
      for (const id of order) {
        const it = items[id];
        if (!it) continue;
        if (it.curatedProductId === product.id) {
          n += 1;
          continue;
        }
        if (it.curatedProductId) continue;
        if (product.placeBuiltinKind && it.kind === product.placeBuiltinKind) n += 1;
        else if (product.placeCatalogKind && it.kind === product.placeCatalogKind) n += 1;
      }
      counts.set(product.id, n);
    }
    return counts;
  }, [activeLine, items, order]);

  const detailProducts = useMemo(() => {
    if (!activeLine) return [];
    const next = [...activeLine.products];
    if (detailSort === 'price') {
      const dir = priceDir === 'asc' ? 1 : -1;
      next.sort((a, b) => {
        const ap = a.priceCents;
        const bp = b.priceCents;
        if (ap == null && bp == null) return a.sortOrder - b.sortOrder;
        if (ap == null) return 1;
        if (bp == null) return -1;
        return (ap - bp) * dir || a.sortOrder - b.sortOrder;
      });
    } else {
      next.sort((a, b) => {
        const ac = placementCountByProductId.get(a.id) ?? 0;
        const bc = placementCountByProductId.get(b.id) ?? 0;
        return bc - ac || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
      });
    }
    return next;
  }, [activeLine, detailSort, priceDir, placementCountByProductId]);

  const footer = useMemo(() => {
    const sumCents = (subset: ChecklistLine[]) => {
      let sum = 0;
      let known = true;
      for (const line of subset) {
        if (line.fromPriceCents == null) {
          known = false;
          continue;
        }
        sum += line.fromPriceCents * line.quantity;
      }
      return { sum, known };
    };

    if (tab === 'todo') {
      const { sum, known } = sumCents(lines.filter((l) => !l.placed));
      const label = formatPriceCents(sum) ?? '$0';
      return { eyebrow: 'Still to buy', value: known ? label : `${label}+` };
    }
    if (tab === 'placed') {
      const { sum, known } = sumCents(lines.filter((l) => l.placed));
      const label = formatPriceCents(sum) ?? '$0';
      return { eyebrow: 'Spent so far', value: known ? label : `${label}+` };
    }
    const { sum, known } = sumCents(lines);
    const label = formatPriceCents(sum) ?? '$0';
    return { eyebrow: 'Room total', value: known ? label : `${label}+` };
  }, [lines, tab]);

  const handlePlace = async (product: CuratedProduct) => {
    if (placingId) return;
    setActionError(null);
    setPlacingId(product.id);
    try {
      const id = await placeCuratedProduct(product);
      if (!id) setActionError('No 3D model linked for this option yet.');
      else select(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not place in room');
    } finally {
      setPlacingId(null);
    }
  };

  const handleSwap = async (product: CuratedProduct) => {
    if (!activeLine || placingId) return;
    setActionError(null);
    setPlacingId(product.id);
    try {
      for (const p of activeLine.products) {
        const existing = findRoomItemForProduct(p, items, order);
        if (existing) removeItem(existing);
      }
      const id = await placeCuratedProduct(product);
      if (!id) setActionError('No 3D model linked for this option yet.');
      else select(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not swap in room');
    } finally {
      setPlacingId(null);
    }
  };

  const handleDownloadGlb = async (product: CuratedProduct) => {
    if (!canDownloadGlb || !product.placeCatalogKind || downloadKind) return;
    setActionError(null);
    setDownloadKind(product.placeCatalogKind);
    try {
      await downloadCatalogModelByKind(product.placeCatalogKind, product.name);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not download model');
    } finally {
      setDownloadKind(null);
    }
  };

  const shopProduct = (product: CuratedProduct) => {
    const url = product.affiliateUrl?.trim();
    if (!url) return;
    trackAffiliateClick({
      retailer: product.retailer,
      product_id: product.id,
      approximate: false,
      source: 'designer_checklist_mobile',
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (activeLine) {
    const budget = formatPriceCents(activeLine.fromPriceCents, activeLine.currency) ?? '—';

    return (
      <MobileSheet
        kind="checklist"
        title={activeLine.name}
        onClose={onClose}
        hideTitle
        bodyClassName="dgm-sheet-body--checklist-detail"
      >
        <div className="dgm-checklist-detail-head">
          <button type="button" className="dgm-back-btn" onClick={onCloseItem}>
            ‹ Checklist
          </button>
          <div className="dgm-checklist-detail-head__copy">
            <span className="dgm-eyebrow">Checklist · {activeLine.groupName}</span>
            <h2 className="dgm-checklist-detail-head__title">{activeLine.name}</h2>
          </div>
          <div className="dgm-budget">
            <span className="dgm-budget__eyebrow">Budget</span>
            <span className="dgm-budget__value">{budget}</span>
          </div>
        </div>

        <div className="dgm-checklist-detail-toolbar">
          <div className="dgm-sort-pills" role="group" aria-label="Sort options">
            <button
              type="button"
              className={`dgm-sort-pill${detailSort === 'popular' ? ' is-active' : ''}`}
              onClick={() => setDetailSort('popular')}
            >
              Popular
            </button>
            <button
              type="button"
              className={`dgm-sort-pill${detailSort === 'price' ? ' is-active' : ''}`}
              aria-label={
                detailSort === 'price'
                  ? priceDir === 'asc'
                    ? 'Sort by price ascending'
                    : 'Sort by price descending'
                  : 'Sort by price'
              }
              onClick={() => {
                if (detailSort === 'price') setPriceDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                else setDetailSort('price');
              }}
            >
              Price {priceDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
          <span className="dgm-checklist-detail-count">
            {activeLine.optionCount} option{activeLine.optionCount === 1 ? '' : 's'}
          </span>
        </div>

        <div className="dgm-checklist-detail-list">
          {actionError ? (
            <p className="dgm-error" role="alert">
              {actionError}
            </p>
          ) : null}
          {detailProducts.length === 0 ? (
            <p className="dgm-empty__hint">Products coming soon for this item.</p>
          ) : (
            detailProducts.map((product) => {
              const price = formatPriceCents(product.priceCents, product.currency);
              const shopUrl = product.affiliateUrl?.trim();
              const roomId = findRoomItemForProduct(product, items, order);
              const inRoom = !!roomId;
              const placeable = productHasPlaceableModel(product);
              const badges = productBadges(product, activeLine.products, inRoom);
              const retailer = product.retailer?.trim() || 'shop';

              return (
                <article key={product.id} className="dgm-offer-card">
                  <div className="dgm-offer-card__top">
                    <div className="dgm-offer-card__thumb" aria-hidden>
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <span>{product.name.slice(0, 1)}</span>
                      )}
                    </div>
                    <div className="dgm-offer-card__meta">
                      <div className="dgm-offer-card__price-row">
                        <span className="dgm-offer-card__price">{price ?? '—'}</span>
                        {badges.map((b) => (
                          <span
                            key={b}
                            className={`dgm-offer-card__badge${b === 'In room' ? ' is-room' : ''}`}
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                      <div className="dgm-offer-card__name">{product.name}</div>
                      <div className="dgm-offer-card__vendor">{vendorLine(product)}</div>
                    </div>
                  </div>
                  {product.description ? (
                    <p className="dgm-offer-card__desc">{product.description}</p>
                  ) : null}

                  {shopUrl ? (
                    <a
                      className="dgm-shop-btn"
                      href={shopUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        trackAffiliateClick({
                          retailer: product.retailer,
                          product_id: product.id,
                          approximate: false,
                          source: 'designer_checklist_mobile',
                        })
                      }
                    >
                      Shop {price ?? ''} at {retailer}
                    </a>
                  ) : (
                    <button type="button" className="dgm-shop-btn" disabled>
                      Shop link coming soon
                    </button>
                  )}

                  <div className="dgm-offer-card__actions">
                    {inRoom && roomId ? (
                      <>
                        <button type="button" className="dgm-action-btn" onClick={() => select(roomId)}>
                          Find in room
                        </button>
                        <button
                          type="button"
                          className="dgm-action-btn"
                          disabled={placingId === product.id}
                          onClick={() => void handleSwap(product)}
                        >
                          Swap
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="dgm-action-btn is-accent"
                          disabled={!placeable || placingId === product.id}
                          onClick={() => void handlePlace(product)}
                          title={placeable ? undefined : 'No 3D model linked yet'}
                        >
                          {placingId === product.id ? 'Placing…' : 'Place in room'}
                        </button>
                        <button
                          type="button"
                          className="dgm-action-btn"
                          onClick={() => void addToList(product.id)}
                        >
                          Add to list
                        </button>
                      </>
                    )}
                    {canDownloadGlb && product.placeCatalogKind ? (
                      <button
                        type="button"
                        className="dgm-action-btn"
                        disabled={downloadKind === product.placeCatalogKind}
                        onClick={() => void handleDownloadGlb(product)}
                      >
                        {downloadKind === product.placeCatalogKind ? '…' : 'GLB ↓'}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </MobileSheet>
    );
  }

  return (
    <MobileSheet
      kind="checklist"
      title="Move-in checklist"
      onClose={onClose}
      hideTitle
      bodyClassName="dgm-sheet-body--checklist"
    >
      <div className="dgm-checklist-head">
        <ProgressRing pct={progressPct} />
        <div className="dgm-checklist-head__copy">
          <span className="dgm-checklist-head__title">
            {placedCount} of {totalCount || '—'} placed
          </span>
          <span className="dgm-checklist-head__sub">
            {footer.eyebrow} · {footer.value}
          </span>
        </div>
      </div>

      <div className="dgm-segment-row dgm-segment-row--3" role="tablist" aria-label="Checklist filter">
        {(
          [
            { id: 'todo' as const, label: 'To place', count: todoCount },
            { id: 'placed' as const, label: 'Placed', count: placedCount },
            { id: 'all' as const, label: 'All', count: null },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`dgm-segment-btn${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.count == null ? t.label : `${t.label} · ${t.count}`}
          </button>
        ))}
      </div>

      <div className="dgm-checklist-scroll">
        {totalCount === 0 ? (
          <p className="dgm-empty__hint">Checklist items will show up here once the catalog loads.</p>
        ) : groups.length === 0 ? (
          <p className="dgm-empty__hint">
            {tab === 'todo' ? 'Everything on your list is placed.' : 'Nothing placed yet.'}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.id} className="dgm-checklist-group">
              <div className="dgm-checklist-group__head">
                <span className="dgm-eyebrow">{group.name}</span>
                <span className="dgm-checklist-group__rule" aria-hidden />
                <span className="dgm-checklist-group__frac">
                  {group.placed}/{group.total}
                </span>
              </div>
              <ul className="dgm-checklist-group__list">
                {group.lines.map((line) => (
                  <li key={line.categoryId}>
                    <button
                      type="button"
                      className={`dgm-checklist-item${line.placed ? ' is-placed' : ''}`}
                      onClick={() => onOpenItem(line.categoryId)}
                    >
                      <span className={`dgm-checklist-item__check${line.placed ? ' is-on' : ''}`} aria-hidden>
                        {line.placed ? '✓' : null}
                      </span>
                      <span className="dgm-checklist-item__copy">
                        <span className="dgm-checklist-item__name">{line.name}</span>
                        <span className="dgm-checklist-item__sub">
                          {optionsLabel(line.optionCount, line.fromPriceCents, line.currency)}
                        </span>
                      </span>
                      <span className="dgm-checklist-item__cue">Shop ›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="dgm-checklist-foot">
        <div className="dgm-checklist-total">
          <span className="dgm-checklist-total__eyebrow">{footer.eyebrow}</span>
          <span className="dgm-checklist-total__value">{footer.value}</span>
        </div>
      </div>
    </MobileSheet>
  );
}
