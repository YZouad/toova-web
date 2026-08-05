import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
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
        <header style={{ padding: '28px 28px 0', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <Eyebrow level="section">Curated picks</Eyebrow>
            <SectionOpener level={5} title={`${categoryName}.`} id={titleId} style={{ marginTop: 8 }} />
          </div>
          <button
            ref={closeRef}
            type="button"
            className="kit-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {products.length === 0 ? (
          <p style={{ padding: '24px 28px', margin: 0, color: 'var(--ink-4)' }}>
            Products coming soon for this item.
          </p>
        ) : (
          <ul className="product-drawer-list" style={{ padding: '0 28px' }}>
            {products.map((product) => {
              const price = formatPriceCents(product.priceCents, product.currency);
              const placeable =
                Boolean(product.placeBuiltinKind || product.placeCatalogKind) && canPlace;
              return (
                <li key={product.id} className="product-drawer-item">
                  <div className="product-drawer-item-media">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" />
                    ) : (
                      <span className="product-drawer-item-fallback">
                        {product.name.slice(0, 1)}
                      </span>
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                      <h3 style={{ margin: 0, font: 'var(--type-strong)', fontSize: 18 }}>{product.name}</h3>
                      {price ? (
                        <MonoMeta size="md" tone="dense">{price}</MonoMeta>
                      ) : (
                        <MonoMeta size="md" tone="subtle">Price varies</MonoMeta>
                      )}
                    </div>
                    <p style={{ margin: '8px 0', font: 'var(--type-body-sm)', color: 'var(--ink-4)', lineHeight: 1.45 }}>
                      {product.description}
                    </p>
                    <MonoMeta size="xs" tone="dense" upper style={{ display: 'block' }}>
                      {product.retailer}
                    </MonoMeta>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                      <Button size="sm" variant="outline" onClick={() => onAddToList(product)}>
                        Add to list
                      </Button>
                      <a
                        className="kit-btn kit-btn--primary kit-btn--sm"
                        href={product.affiliateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Shop
                      </a>
                      {placeable && onPlace ? (
                        <Button size="sm" variant="mono" onClick={() => onPlace(product)}>
                          Place in room
                        </Button>
                      ) : null}
                    </div>
                    {!canPlace && product.placeBuiltinKind ? (
                      <MonoMeta size="xs" tone="subtle" style={{ display: 'block', marginTop: 8 }}>
                        {placeHint ?? 'Open a room to place this item.'}
                      </MonoMeta>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <MonoMeta size="xs" tone="subtle" style={{ display: 'block', padding: '24px 28px' }}>
          As an Amazon Associate, Toova may earn from qualifying purchases. Displayed prices
          may change on the retailer site.
        </MonoMeta>
      </div>
    </div>,
    document.body,
  );
}
