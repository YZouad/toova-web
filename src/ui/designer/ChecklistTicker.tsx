import { useEffect, useMemo, useRef, useState } from 'react';
import { useShoppingCatalogContext } from '../../context/ShoppingCatalogContext';
import { useAuth } from '../../hooks/useAuth';
import { trackAffiliateClicked } from '../../lib/analytics';
import { productHasPlaceableModel } from '../../lib/checklistPublicGlbs';
import {
  categoryIdsSatisfiedByPlacements,
  formatPriceCents,
  getProductDrawKind,
  roomItemsToPlacementRefs,
  type CuratedProduct,
} from '../../lib/dormChecklist';
import {
  buildChecklistGroups,
  buildChecklistLines,
  checklistLineStatusLabel,
  filterChecklistLinesByTab,
  type ChecklistLineModel,
} from '../../lib/checklistLines';
import { checklistProgressCounts } from '../../lib/checklistProgress';
import { downloadCatalogModelByKind } from '../../lib/modelStorage';
import {
  countRoomPlacementsForProduct,
  findRoomItemForProduct,
  placeCuratedProduct,
  startChecklistDrawPlacement,
} from '../../lib/placeCuratedProduct';
import { useStore, type HangingDecorKind } from '../../store';
import {
  ChecklistBudgetFoot,
  ChecklistResolutionActions,
} from './ChecklistBudgetFoot';
import { ChecklistCheckoutPanel } from '../ChecklistCheckoutPanel';

export interface ChecklistTickerProps {
  open: boolean;
  onToggle: () => void;
  compact?: boolean;
  onOpenFull?: () => void;
  onStartDraw?: (kind: HangingDecorKind) => void;
}

type TickerTab = 'todo' | 'placed' | 'all';
type DetailSort = 'popular' | 'price';
type PriceDir = 'asc' | 'desc';

type TickerLine = ChecklistLineModel;

interface TickerGroup {
  id: string;
  name: string;
  order: number;
  resolved: number;
  total: number;
  lines: TickerLine[];
}

function ProgressRing({ pct, size = 44 }: { pct: number; size?: number }) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * c;
  return (
    <svg
      className="dg-ticker-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--paper-4)"
        strokeWidth={stroke}
      />
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

function CartIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 5h2l1.5 10h11L20 8H7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="19" r="1.2" fill="currentColor" />
      <circle cx="17" cy="19" r="1.2" fill="currentColor" />
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

export function ChecklistTicker({ open, onToggle, compact, onOpenFull, onStartDraw }: ChecklistTickerProps) {
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const select = useStore((s) => s.select);
  const removeItem = useStore((s) => s.removeItem);
  const { categories, categoriesById, list, addToList, removeFromList, getResolution, setResolution, budgetSummary, setMoveInBudget, purchaseCartLines } = useShoppingCatalogContext();
  const { user } = useAuth();
  const canDownloadGlb = !!user?.id;

  const [tab, setTab] = useState<TickerTab>('todo');
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const seededGroupsRef = useRef(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [detailSort, setDetailSort] = useState<DetailSort>('popular');
  const [priceDir, setPriceDir] = useState<PriceDir>('asc');
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [downloadKind, setDownloadKind] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const listQty = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of list) map.set(entry.productId, entry.quantity);
    return map;
  }, [list]);

  const placedCategoryIds = useMemo(() => {
    return categoryIdsSatisfiedByPlacements(categories, roomItemsToPlacementRefs(items, order));
  }, [categories, items, order]);

  const lines = useMemo(
    (): TickerLine[] =>
      buildChecklistLines({
        categories,
        categoriesById,
        placedCategoryIds,
        getResolution,
        listQty,
      }),
    [categories, categoriesById, listQty, placedCategoryIds, getResolution],
  );

  const { placed: placedCount, todo: todoCount, total: totalCount, resolved: resolvedCount, progressPct } =
    useMemo(() => checklistProgressCounts(lines), [lines]);

  const visibleLines = useMemo(
    () => filterChecklistLinesByTab(lines, tab),
    [lines, tab],
  );

  const groups = useMemo(
    (): TickerGroup[] => buildChecklistGroups(lines, visibleLines),
    [visibleLines, lines],
  );

  useEffect(() => {
    if (seededGroupsRef.current || lines.length === 0) return;
    seededGroupsRef.current = true;
    const firstOpen = lines.find((l) => l.status === 'open')?.groupId ?? lines[0]?.groupId ?? null;
    setOpenGroups(firstOpen ? new Set([firstOpen]) : new Set());
  }, [lines]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeLine = activeCategoryId
    ? lines.find((l) => l.categoryId === activeCategoryId) ?? null
    : null;

  const placementCountByProductId = useMemo(() => {
    const counts = new Map<string, number>();
    if (!activeLine) return counts;
    for (const product of activeLine.products) {
      counts.set(product.id, countRoomPlacementsForProduct(product, items, order));
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

  const openDetail = (categoryId: string) => {
    setActionError(null);
    setDetailSort('popular');
    setPriceDir('asc');
    setActiveCategoryId(categoryId);
  };

  const closeDetail = () => {
    setActiveCategoryId(null);
    setActionError(null);
  };

  const shopProduct = (product: CuratedProduct) => {
    const url = product.affiliateUrl?.trim();
    if (!url) return;
    trackAffiliateClicked({
      retailer: product.retailer,
      product_id: product.id,
      is_price_approximate: false,
      source: 'designer_checklist_ticker',
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handlePlace = async (product: CuratedProduct) => {
    if (placingId) return;
    setActionError(null);
    setPlacingId(product.id);
    try {
      const drawKind = getProductDrawKind(product);
      if (drawKind) {
        startChecklistDrawPlacement(product);
        onStartDraw?.(drawKind);
        closeDetail();
        return;
      }
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
      const drawKind = getProductDrawKind(product);
      if (drawKind) {
        startChecklistDrawPlacement(product);
        onStartDraw?.(drawKind);
        closeDetail();
        return;
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

  const shopAll = () => {
    if (!activeLine) return;
    const withUrl = [...activeLine.products]
      .filter((p) => p.affiliateUrl?.trim())
      .sort((a, b) => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity));
    const first = withUrl[0];
    if (first) shopProduct(first);
  };

  const head = (
    <button
      type="button"
      className={`dg-ticker-head${open ? ' is-open' : ''}`}
      onClick={onToggle}
      aria-expanded={open}
    >
      <ProgressRing pct={progressPct} size={open ? 48 : 40} />
      <div className="dg-ticker-head__copy">
        <span className="dg-ticker-head__eyebrow">Move-in checklist</span>
        <span className="dg-ticker-head__title">
          {placedCount} of {totalCount || '—'} categories placed
        </span>
        {totalCount > 0 ? (
          <span className="dg-ticker-head__sub">
            {todoCount} to place
            {resolvedCount > 0 ? ` · ${resolvedCount} already have or skipped` : ''}
          </span>
        ) : null}
      </div>
      <span className="dg-ticker-head__chev" aria-hidden>
        {open ? '▴' : '▾'}
      </span>
    </button>
  );

  if (compact) {
    return (
      <div data-tour-id="ticker" className="dg-ticker dg-ticker--pill">
        <button type="button" className="dg-ticker-pill-btn" onClick={onToggle}>
          <ProgressRing pct={progressPct} size={28} />
          <span>
            {placedCount}/{totalCount || 0}
          </span>
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div data-tour-id="ticker" className="dg-ticker">
        <div className="dg-ticker-card dg-ticker-card--collapsed">{head}</div>
      </div>
    );
  }

  if (activeLine) {
    const budget =
      formatPriceCents(activeLine.fromPriceCents, activeLine.currency) ?? '—';

    return (
      <div data-tour-id="ticker" className="dg-ticker">
        <div className="dg-ticker-card dg-ticker-card--detail">
          <div className="dg-ticker-detail-head">
            <button
              type="button"
              className="dg-ticker-back"
              onClick={closeDetail}
              aria-label="Back to checklist"
            >
              ‹
            </button>
            <div className="dg-ticker-detail-head__copy">
              <span className="dg-ticker-detail-head__eyebrow">
                Checklist · {activeLine.groupName}
              </span>
              <h2 className="dg-ticker-detail-head__title">{activeLine.name}</h2>
            </div>
            <div className="dg-ticker-budget">
              <span className="dg-ticker-budget__eyebrow">Budget</span>
              <span className="dg-ticker-budget__value">{budget}</span>
            </div>
          </div>

          <div className="dg-ticker-detail-toolbar">
            <ChecklistResolutionActions
              status={activeLine.status}
              onHave={() => void setResolution(activeLine.categoryId, 'have')}
              onSkip={() => void setResolution(activeLine.categoryId, 'skip')}
              onUndo={() => void setResolution(activeLine.categoryId, null)}
              className="dg-ticker-resolution"
            />
            <div className="dg-ticker-sort" role="group" aria-label="Sort options">
              <button
                type="button"
                className={`dg-ticker-sort__btn${detailSort === 'popular' ? ' is-active' : ''}`}
                onClick={() => setDetailSort('popular')}
              >
                Popular
              </button>
              <button
                type="button"
                className={`dg-ticker-sort__btn${detailSort === 'price' ? ' is-active' : ''}`}
                aria-label={
                  detailSort === 'price'
                    ? priceDir === 'asc'
                      ? 'Sort by price, ascending. Click to sort descending.'
                      : 'Sort by price, descending. Click to sort ascending.'
                    : 'Sort by price, ascending'
                }
                onClick={() => {
                  if (detailSort === 'price') {
                    setPriceDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                  } else {
                    setDetailSort('price');
                  }
                }}
              >
                Price {priceDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            <span className="dg-ticker-detail-count">
              {activeLine.optionCount} option{activeLine.optionCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className="dg-ticker-body dg-ticker-body--detail">
            {actionError ? (
              <p className="dg-ticker-empty" role="alert">
                {actionError}
              </p>
            ) : null}
            {detailProducts.length === 0 ? (
              <p className="dg-ticker-empty">Products coming soon for this item.</p>
            ) : (
              detailProducts.map((product) => {
                const price = formatPriceCents(product.priceCents, product.currency);
                const shopUrl = product.affiliateUrl?.trim();
                const roomId = findRoomItemForProduct(product, items, order);
                const inRoom = !!roomId;
                const placeable = productHasPlaceableModel(product);
                const drawKind = getProductDrawKind(product);
                const placeLabel = drawKind
                  ? (placingId === product.id ? 'Starting…' : 'Draw in room')
                  : (placingId === product.id ? 'Placing…' : 'Place in room');
                const badges = productBadges(product, activeLine.products, inRoom);
                const retailer = product.retailer?.trim() || 'shop';

                return (
                  <article key={product.id} className="dg-ticker-offer">
                    <div className="dg-ticker-offer__top">
                      <div className="dg-ticker-offer__thumb" aria-hidden>
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          <span>{product.name.slice(0, 1)}</span>
                        )}
                      </div>
                      <div className="dg-ticker-offer__meta">
                        <div className="dg-ticker-offer__price-row">
                          <span className="dg-ticker-offer__price">{price ?? '—'}</span>
                          {badges.map((b) => (
                            <span
                              key={b}
                              className={`dg-ticker-offer__badge${b === 'In room' ? ' is-room' : ''}`}
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                        <div className="dg-ticker-offer__name">{product.name}</div>
                        <div className="dg-ticker-offer__vendor">{vendorLine(product)}</div>
                      </div>
                    </div>
                    {product.description ? (
                      <p className="dg-ticker-offer__desc">{product.description}</p>
                    ) : null}

                    {shopUrl ? (
                      <a
                        className="dg-ticker-shop"
                        href={shopUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          trackAffiliateClicked({
                            retailer: product.retailer,
                            product_id: product.id,
                            is_price_approximate: false,
                            source: 'designer_checklist_ticker',
                          })
                        }
                      >
                        <CartIcon />
                        Shop {price ?? ''} at {retailer}
                      </a>
                    ) : (
                      <button type="button" className="dg-ticker-shop" disabled>
                        <CartIcon />
                        Shop link coming soon
                      </button>
                    )}

                    <div className="dg-ticker-offer__actions">
                      {inRoom && roomId ? (
                        <>
                          <button
                            type="button"
                            className="dg-ticker-sec"
                            onClick={() => select(roomId)}
                          >
                            Find in room
                          </button>
                          <button
                            type="button"
                            className="dg-ticker-sec dg-ticker-sec--sm"
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
                            className="dg-ticker-sec"
                            disabled={!placeable || placingId === product.id}
                            onClick={() => void handlePlace(product)}
                            title={placeable ? undefined : 'No 3D model linked yet'}
                          >
                            {placeLabel}
                          </button>
                          <button
                            type="button"
                            className="dg-ticker-sec dg-ticker-sec--sm"
                            disabled={list.some((e) => e.productId === product.id)}
                            onClick={() => void addToList(product.id)}
                          >
                            {list.some((e) => e.productId === product.id) ? 'On list' : 'Add to list'}
                          </button>
                        </>
                      )}
                      {canDownloadGlb && product.placeCatalogKind ? (
                        <button
                          type="button"
                          className="dg-ticker-sec dg-ticker-sec--sm"
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

          <div className="dg-ticker-foot dg-ticker-foot--detail">
            <button
              type="button"
              className="dg-ticker-cta dg-ticker-cta--checkout"
              onClick={() => setCheckoutOpen(true)}
              disabled={purchaseCartLines.length === 0}
            >
              Checkout · {purchaseCartLines.length} item{purchaseCartLines.length === 1 ? '' : 's'}
            </button>
            <button
              type="button"
              className="dg-ticker-cta"
              onClick={shopAll}
              disabled={!activeLine.products.some((p) => p.affiliateUrl?.trim())}
            >
              Shop all {activeLine.name.toLowerCase()} ↗
            </button>
          </div>
        </div>
        {checkoutOpen ? (
          <ChecklistCheckoutPanel
            lines={purchaseCartLines}
            onClose={() => setCheckoutOpen(false)}
            onRemoveFromList={(productId) => void removeFromList(productId)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div data-tour-id="ticker" className="dg-ticker">
      <div className="dg-ticker-card">
        {head}

        <div className="dg-ticker-tabs" role="tablist" aria-label="Checklist filter">
          {(
            [
              { id: 'todo', label: 'To place', count: todoCount },
              { id: 'placed', label: 'Placed', count: placedCount },
              { id: 'all', label: 'All', count: totalCount },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`dg-ticker-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.count == null ? t.label : `${t.label} · ${t.count}`}
            </button>
          ))}
        </div>

        <div className="dg-ticker-body">
          {totalCount === 0 ? (
            <p className="dg-ticker-empty">
              Checklist items will show up here once the catalog loads.
            </p>
          ) : groups.length === 0 ? (
            <p className="dg-ticker-empty">
              {tab === 'todo'
                ? 'Everything on your list is placed or resolved.'
                : tab === 'placed'
                  ? 'Nothing placed yet.'
                  : 'No checklist items yet.'}
            </p>
          ) : (
            groups.map((group) => {
              const expanded = openGroups.has(group.id);
              return (
                <section
                  key={group.id}
                  className={`dg-ticker-group${expanded ? ' is-open' : ''}`}
                >
                  <button
                    type="button"
                    className="dg-ticker-group__head"
                    aria-expanded={expanded}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span className="dg-ticker-group__name">{group.name}</span>
                    <span className="dg-ticker-group__rule" aria-hidden />
                    <span className="dg-ticker-group__frac">
                      {group.resolved}/{group.total}
                    </span>
                    <span className="dg-ticker-group__chev" aria-hidden>
                      ▾
                    </span>
                  </button>
                  {expanded ? (
                    <div className="dg-ticker-group__list">
                      {group.lines.map((line) => {
                        const statusChip = checklistLineStatusLabel(line.status);
                        return (
                        <div
                          key={line.categoryId}
                          className={`dg-ticker-item${line.placed ? ' is-placed' : ''}${line.status === 'have' || line.status === 'skip' ? ' is-resolved' : ''}`}
                        >
                          <button
                            type="button"
                            className="dg-ticker-item__main"
                            onClick={() => openDetail(line.categoryId)}
                          >
                            <span
                              className={`dg-ticker-item__check${line.placed ? ' is-on' : ''}${statusChip ? ' is-chip' : ''}`}
                              aria-hidden
                            >
                              {line.placed ? '✓' : statusChip}
                            </span>
                            <span className="dg-ticker-item__copy">
                              <span className="dg-ticker-item__name">{line.name}</span>
                              <span className="dg-ticker-item__sub">
                                {optionsLabel(line.optionCount, line.fromPriceCents, line.currency)}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="dg-ticker-item__shop"
                            onClick={() => openDetail(line.categoryId)}
                          >
                            Shop ›
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })
          )}
        </div>

        <div className="dg-ticker-foot">
          <ChecklistBudgetFoot
            budget={budgetSummary}
            onSetBudget={(cents) => void setMoveInBudget(cents)}
            totalClassName="dg-ticker-total"
            eyebrowClassName="dg-ticker-total__eyebrow"
            valueClassName="dg-ticker-total__value"
            subClassName="dg-ticker-total__sub"
            ctaClassName="dg-ticker-cta dg-ticker-cta--budget"
          />
          {onOpenFull ? (
            <button type="button" className="dg-ticker-cta" onClick={onOpenFull}>
              Open full checklist
            </button>
          ) : null}
          <button
            type="button"
            className="dg-ticker-cta dg-ticker-cta--checkout"
            onClick={() => setCheckoutOpen(true)}
            disabled={purchaseCartLines.length === 0}
          >
            Checkout · {purchaseCartLines.length} item{purchaseCartLines.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
      {checkoutOpen ? (
        <ChecklistCheckoutPanel
          lines={purchaseCartLines}
          onClose={() => setCheckoutOpen(false)}
          onRemoveFromList={(productId) => void removeFromList(productId)}
        />
      ) : null}
    </div>
  );
}
