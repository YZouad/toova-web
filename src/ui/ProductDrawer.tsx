import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { trackAffiliateClick } from '../lib/analytics';
import type { CuratedProduct } from '../lib/dormChecklist';
import { formatPriceCents } from '../lib/dormChecklist';
import { Button, Eyebrow, MonoMeta, SectionOpener } from './kit';

interface ProductDrawerProps {
  categoryName: string;
  products: CuratedProduct[];
  canPlace: boolean;
  onClose: () => void;
  onAddToList: (product: CuratedProduct) => void;
  onPlace?: (product: CuratedProduct) => void;
  placeHint?: string | null;
}

function formatRating(rating: number | null, reviewCount: number | null): string | null {
  if (rating == null || !Number.isFinite(rating)) return null;
  const stars = `${rating.toFixed(1)} out of 5`;
  if (reviewCount != null && reviewCount > 0) {
    return `${stars} · ${reviewCount.toLocaleString()} ratings`;
  }
  return stars;
}

export function ProductDrawer({
  categoryName,
  products,
  canPlace,
  onClose,
  onAddToList,
  onPlace,
  placeHint,
}: ProductDrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
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
    <div className="product-drawer-backdrop" role="presentation" onClick={onClose}>
      <div
        className="product-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="product-drawer-head">
          <div>
            <Eyebrow level="section">Curated picks</Eyebrow>
            <SectionOpener level={5} title={`${categoryName}.`} id={titleId} style={{ marginTop: 8 }} />
          </div>
          <button
            ref={closeRef}
            type="button"
            className="product-drawer-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {products.length === 0 ? (
          <p className="product-drawer-empty">Products coming soon for this item.</p>
        ) : (
          <ul className="product-drawer-list">
            {products.map((product) => {
              const price = formatPriceCents(product.priceCents, product.currency);
              const placeable =
                Boolean(product.placeBuiltinKind || product.placeCatalogKind) && canPlace;
              const ratingLabel = formatRating(product.rating, product.reviewCount);
              return (
                <li key={product.id} className="product-drawer-item product-drawer-item--detail">
                  <div className="product-drawer-item-media product-drawer-item-media--lg">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" />
                    ) : (
                      <span className="product-drawer-item-fallback">
                        {product.name.slice(0, 1)}
                      </span>
                    )}
                  </div>
                  <div className="product-drawer-item-body">
                    {product.brand ? (
                      <MonoMeta size="xs" tone="dense" upper className="product-drawer-brand">
                        {product.brand}
                      </MonoMeta>
                    ) : null}
                    <div className="product-drawer-item-title-row">
                      <h3 className="product-drawer-item-title">{product.name}</h3>
                      {price ? (
                        <MonoMeta size="md" tone="dense" className="product-drawer-item-price">
                          {price}
                        </MonoMeta>
                      ) : (
                        <MonoMeta size="md" tone="subtle" className="product-drawer-item-price">
                          Price varies
                        </MonoMeta>
                      )}
                    </div>
                    {ratingLabel ? (
                      <p className="product-drawer-rating">{ratingLabel}</p>
                    ) : null}
                    {product.availability ? (
                      <p className="product-drawer-availability">{product.availability}</p>
                    ) : null}
                    {product.description ? (
                      <p className="product-drawer-item-desc">{product.description}</p>
                    ) : null}
                    {product.featureBullets.length > 0 ? (
                      <ul className="product-drawer-bullets">
                        {product.featureBullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    ) : null}
                    {product.dimensionsText ? (
                      <p className="product-drawer-dims">
                        <span className="product-drawer-dims-label">Details</span>
                        {product.dimensionsText}
                      </p>
                    ) : null}
                    <MonoMeta size="xs" tone="dense" upper className="product-drawer-retailer">
                      Sold by {product.retailer}
                    </MonoMeta>
                    <div className="product-drawer-item-actions">
                      <Button size="sm" variant="outline" onClick={() => onAddToList(product)}>
                        Add to list
                      </Button>
                      <a
                        className="kit-btn kit-btn--primary kit-btn--sm"
                        href={product.affiliateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          trackAffiliateClick({
                            retailer: product.retailer,
                            product_id: product.id,
                            approximate: false,
                            source: 'product_drawer',
                          })
                        }
                      >
                        Shop on {product.retailer}
                      </a>
                      {placeable && onPlace ? (
                        <Button size="sm" variant="mono" onClick={() => onPlace(product)}>
                          Place in room
                        </Button>
                      ) : null}
                    </div>
                    {!canPlace && (product.placeBuiltinKind || product.placeCatalogKind) ? (
                      <MonoMeta size="xs" tone="subtle" className="product-drawer-place-hint">
                        {placeHint ?? 'Open a room to place this item.'}
                      </MonoMeta>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <MonoMeta size="xs" tone="subtle" className="product-drawer-affiliate">
          As an Amazon Associate, Toova may earn from qualifying purchases. Displayed prices
          may change on the retailer site.
        </MonoMeta>
      </div>
    </div>,
    document.body,
  );
}
