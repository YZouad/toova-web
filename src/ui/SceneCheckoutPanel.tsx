import { useMemo, useState } from 'react';
import { useShoppingCatalogContext } from '../context/ShoppingCatalogContext';
import { formatPriceCents } from '../lib/dormChecklist';
import { ProductDrawer } from './ProductDrawer';
import { PurchaseReviewPanel } from './PurchaseReviewPanel';
import { useStore, type Item } from '../store';
import type { CuratedProduct } from '../lib/dormChecklist';
import type { FurnitureKind } from '../furniture/registry';
import { FURNITURE } from '../furniture/registry';
import { signBrowsableModelPath } from '../lib/modelStorage';
import { parseInchDims } from '../lib/importedItemSize';
import { supabase } from '../lib/supabase';
import { recordCatalogDownload } from '../lib/catalogEngagement';
import { resolveAffiliateForItem } from '../lib/affiliateLinks';
import { GlassSurface } from './GlassSurface';
import { Button } from './kit/Button';

interface SceneCheckoutPanelProps {
  onOpenChecklist: () => void;
}

interface RoomLine {
  key: string;
  label: string;
  count: number;
  itemIds: string[];
  sample: Item;
  product: CuratedProduct | null;
}

export function SceneCheckoutPanel({ onOpenChecklist }: SceneCheckoutPanelProps) {
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const select = useStore((s) => s.select);
  const addItem = useStore((s) => s.addItem);
  const {
    categories,
    productsById,
    isCategoryDone,
    toggleChecked,
    list,
    addToList,
    setQuantity,
    removeFromList,
    markReviewDone,
  } = useShoppingCatalogContext();

  const [toBuyOpen, setToBuyOpen] = useState(true);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [activeRoomKey, setActiveRoomKey] = useState<string | null>(null);

  const openCategory = useMemo(
    () => categories.find((c) => c.id === openCategoryId) ?? null,
    [categories, openCategoryId],
  );

  const roomLines = useMemo((): RoomLine[] => {
    const map = new Map<string, RoomLine>();
    for (const id of order) {
      const item = items[id];
      if (!item) continue;
      const identity =
        item.curatedProductId
        ?? (item.kind === 'imported'
          ? `imp:${item.importedStoragePath ?? item.label}`
          : `kind:${item.kind}:${item.label}`);
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
          product: item.curatedProductId
            ? productsById[item.curatedProductId] ?? null
            : null,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [items, order, productsById]);

  const placedProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const line of roomLines) {
      if (line.product) ids.add(line.product.id);
    }
    return ids;
  }, [roomLines]);

  const listOnlyLines = useMemo(() => {
    return list
      .map((entry) => {
        const product = productsById[entry.productId];
        if (!product || placedProductIds.has(product.id)) return null;
        return { entry, product };
      })
      .filter((x): x is { entry: (typeof list)[number]; product: CuratedProduct } => x != null)
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [list, productsById, placedProductIds]);

  const reviewLines = useMemo(() => {
    return list
      .map((entry) => {
        const product = productsById[entry.productId];
        if (!product) return null;
        return { entry, product };
      })
      .filter((x): x is { entry: (typeof list)[number]; product: CuratedProduct } => x != null);
  }, [list, productsById]);

  const subtotalCents = useMemo(() => {
    let sum = 0;
    let known = true;
    for (const line of roomLines) {
      if (line.product?.priceCents == null) {
        known = false;
        continue;
      }
      sum += line.product.priceCents * line.count;
    }
    for (const { entry, product } of listOnlyLines) {
      if (product.priceCents == null) {
        known = false;
        continue;
      }
      sum += product.priceCents * entry.quantity;
    }
    return { sum, known };
  }, [roomLines, listOnlyLines]);

  const checklistDone = categories.filter((c) => isCategoryDone(c.id)).length;
  const toBuyCount = roomLines.reduce((n, l) => n + l.count, 0)
    + listOnlyLines.reduce((n, l) => n + l.entry.quantity, 0);

  const activeRoom = roomLines.find((r) => r.key === activeRoomKey) ?? null;
  const activeOffers = activeRoom
    ? resolveAffiliateForItem(activeRoom.sample, productsById)
    : [];

  async function placeProduct(product: CuratedProduct) {
    await addToList(product.id);
    if (product.placeBuiltinKind && product.placeBuiltinKind in FURNITURE) {
      addItem(product.placeBuiltinKind as Exclude<FurnitureKind, 'imported' | 'hanging'>, {
        label: product.name,
        curatedProductId: product.id,
      });
      return;
    }
    if (product.placeCatalogKind) {
      const { data } = await supabase
        .from('furniture_catalog')
        .select('kind,label,model_url,width_in,height_in,depth_in')
        .eq('kind', product.placeCatalogKind)
        .maybeSingle();
      if (!data?.model_url) return;
      const path = String(data.model_url).trim();
      const signed = await signBrowsableModelPath(path);
      if (!signed) return;
      const catalogSizeIn = parseInchDims(
        Number(data.width_in),
        Number(data.height_in),
        Number(data.depth_in),
      );
      addItem('imported', {
        url: signed,
        storagePath: path,
        label: product.name || String(data.label),
        catalogSizeIn: catalogSizeIn ?? undefined,
        curatedProductId: product.id,
      });
      void recordCatalogDownload(String(data.kind)).catch(() => {});
    }
  }

  return (
    <div className="scene-side-panels">
      <GlassSurface compact className="scene-checkout scene-checklist-panel">
        <button
          type="button"
          className="scene-checkout-toggle"
          onClick={() => setChecklistOpen((v) => !v)}
          aria-expanded={checklistOpen}
        >
          <span className="scene-checkout-title">Checklist</span>
          <span className="scene-checkout-badge">
            {checklistDone}/{categories.length}
          </span>
          <span className="scene-checkout-chevron" aria-hidden>
            {checklistOpen ? '▾' : '▸'}
          </span>
        </button>

        {checklistOpen ? (
          <div className="scene-checkout-body">
            <ul className="scene-checkout-mini-list">
              {categories.map((item) => {
                const isChecked = isCategoryDone(item.id);
                return (
                  <li key={item.id}>
                    <div
                      className={`scene-checkout-mini-item${isChecked ? ' scene-checkout-mini-item--done' : ''}`}
                    >
                      <label
                        onMouseDown={(e) => {
                          e.preventDefault();
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => void toggleChecked(item.id)}
                        />
                        <span className="scene-checkout-mini-box" aria-hidden />
                      </label>
                      <button
                        type="button"
                        className="scene-checkout-mini-name-btn"
                        onClick={() => setOpenCategoryId(item.id)}
                      >
                        {item.name}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="scene-checkout-mini-link"
              onClick={onOpenChecklist}
            >
              Open full checklist →
            </button>
          </div>
        ) : null}
      </GlassSurface>

      <GlassSurface compact className="scene-checkout">
        <button
          type="button"
          className="scene-checkout-toggle"
          onClick={() => setToBuyOpen((v) => !v)}
          aria-expanded={toBuyOpen}
        >
          <span className="scene-checkout-title">To buy</span>
          <span className="scene-checkout-badge">{toBuyCount}</span>
          <span className="scene-checkout-chevron" aria-hidden>
            {toBuyOpen ? '▾' : '▸'}
          </span>
        </button>

        {toBuyOpen ? (
          <div className="scene-checkout-body">
            {roomLines.length === 0 && listOnlyLines.length === 0 ? null : (
              <ul className="scene-checkout-list">
                {roomLines.map((line) => {
                  const price = line.product
                    ? formatPriceCents(line.product.priceCents, line.product.currency)
                    : null;
                  const active = activeRoomKey === line.key;
                  return (
                    <li key={line.key}>
                      <button
                        type="button"
                        className={`scene-checkout-row scene-checkout-row--rich scene-checkout-row--click${active ? ' is-active' : ''}`}
                        onClick={() => {
                          setActiveRoomKey(line.key);
                          select(line.itemIds[0] ?? null);
                        }}
                      >
                        <div className="scene-checkout-thumb" aria-hidden>
                          {line.product?.imageUrl ? (
                            <img src={line.product.imageUrl} alt="" />
                          ) : (
                            <span>{line.label.slice(0, 1)}</span>
                          )}
                        </div>
                        <div className="scene-checkout-row-main">
                          <span className="scene-checkout-label">{line.label}</span>
                          <span className="scene-checkout-price">
                            {price ?? 'Shop similar'}
                            {' · '}×{line.count}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}

                {listOnlyLines.map(({ entry, product }) => {
                  const price = formatPriceCents(product.priceCents, product.currency);
                  return (
                    <li key={`list-${product.id}`} className="scene-checkout-row scene-checkout-row--rich">
                      <div className="scene-checkout-thumb" aria-hidden>
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt="" />
                        ) : (
                          <span>{product.name.slice(0, 1)}</span>
                        )}
                      </div>
                      <div className="scene-checkout-row-main">
                        <span className="scene-checkout-label">{product.name}</span>
                        <span className="scene-checkout-price">
                          {price ?? 'Price varies'} · on list
                        </span>
                        <div className="scene-checkout-qty-controls">
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            onClick={() => {
                              if (entry.quantity <= 1) void removeFromList(product.id);
                              else void setQuantity(product.id, entry.quantity - 1);
                            }}
                          >
                            −
                          </button>
                          <span>×{entry.quantity}</span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            onClick={() => void setQuantity(product.id, entry.quantity + 1)}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="scene-checkout-remove"
                            onClick={() => void removeFromList(product.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {activeRoom ? (
              <div className="scene-checkout-item-detail">
                <strong>{activeRoom.label}</strong>
                {activeOffers.map((offer) => (
                  <div key={offer.url} className="scene-checkout-item-offer">
                    {offer.approximate ? (
                      <p>Not a verified product link — shop similar items.</p>
                    ) : offer.priceCents != null ? (
                      <p>{formatPriceCents(offer.priceCents, offer.currency)}</p>
                    ) : null}
                    <a
                      className="tv-btn-primary scene-checkout-shop-link"
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
                        Add to list
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {toBuyCount > 0 ? (
              <div className="scene-checkout-subtotal">
                <span>Subtotal</span>
                <strong>
                  {subtotalCents.known
                    ? formatPriceCents(subtotalCents.sum) ?? '—'
                    : `${formatPriceCents(subtotalCents.sum) ?? '$0'}+`}
                </strong>
                {reviewLines.length > 0 ? (
                  <Button size="sm" className="scene-checkout-review" onClick={() => setReviewOpen(true)}>
                    Review purchases
                  </Button>
                ) : null}
              </div>
            ) : null}

            <p className="scene-checkout-affiliate">
              Affiliate links · prices may change on Amazon.
            </p>
          </div>
        ) : null}
      </GlassSurface>

      {openCategory ? (
        <ProductDrawer
          categoryName={openCategory.name}
          products={openCategory.products}
          canPlace
          onClose={() => setOpenCategoryId(null)}
          onAddToList={(p) => void addToList(p.id)}
          onPlace={(p) => void placeProduct(p)}
        />
      ) : null}

      {reviewOpen ? (
        <PurchaseReviewPanel
          lines={reviewLines}
          onClose={() => setReviewOpen(false)}
          onMarkDone={(productId, done) => void markReviewDone(productId, done)}
        />
      ) : null}
    </div>
  );
}
