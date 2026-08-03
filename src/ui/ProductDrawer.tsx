import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CuratedProduct } from '../lib/dormChecklist';
import { formatPriceCents } from '../lib/dormChecklist';

interface ProductDrawerProps {
  categoryName: string;
  products: CuratedProduct[];
  canPlace: boolean;
  onClose: () => void;
  onAddToList: (product: CuratedProduct) => void;
  onPlace?: (product: CuratedProduct) => void;
  placeHint?: string | null;
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
    <div
      className="product-drawer-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="product-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="product-drawer-head">
          <div>
            <p className="product-drawer-eyebrow">Curated picks</p>
            <h2 id={titleId} className="product-drawer-title">
              {categoryName}
            </h2>
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
          <ul className="product-drawer-grid">
            {products.map((product) => {
              const price = formatPriceCents(product.priceCents, product.currency);
              const placeable =
                Boolean(product.placeBuiltinKind || product.placeCatalogKind) && canPlace;
              return (
                <li key={product.id} className="product-drawer-card">
                  <div className="product-drawer-media" aria-hidden>
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" />
                    ) : (
                      <span className="product-drawer-media-fallback">
                        {product.name.slice(0, 1)}
                      </span>
                    )}
                  </div>
                  <div className="product-drawer-body">
                    <div className="product-drawer-meta">
                      <h3 className="product-drawer-name">{product.name}</h3>
                      {price ? (
                        <span className="product-drawer-price">{price}</span>
                      ) : (
                        <span className="product-drawer-price product-drawer-price--na">
                          Price varies
                        </span>
                      )}
                    </div>
                    <p className="product-drawer-desc">{product.description}</p>
                    <p className="product-drawer-retailer">{product.retailer}</p>
                    <div className="product-drawer-actions">
                      <button
                        type="button"
                        className="tv-btn-ghost product-drawer-btn"
                        onClick={() => onAddToList(product)}
                      >
                        Add to list
                      </button>
                      <a
                        className="tv-btn-primary product-drawer-shop"
                        href={product.affiliateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Shop
                      </a>
                      {placeable && onPlace ? (
                        <button
                          type="button"
                          className="tv-btn-ghost product-drawer-btn"
                          onClick={() => onPlace(product)}
                        >
                          Place in room
                        </button>
                      ) : null}
                    </div>
                    {!canPlace && product.placeBuiltinKind ? (
                      <p className="product-drawer-hint">
                        {placeHint ?? 'Open a room to place this item.'}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="product-drawer-disclaimer">
          As an Amazon Associate, Toova may earn from qualifying purchases. Displayed prices
          may change on the retailer site.
        </p>
      </div>
    </div>,
    document.body,
  );
}
