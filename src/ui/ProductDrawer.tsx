import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { trackAffiliateClicked } from '../lib/analytics';
import { useAuth } from '../hooks/useAuth';
import type { ChecklistLineStatus, CuratedProduct } from '../lib/dormChecklist';
import { formatPriceCents } from '../lib/dormChecklist';
import { ChecklistResolutionActions } from './designer/ChecklistBudgetFoot';
import { productHasPlaceableModel } from '../lib/checklistPublicGlbs';
import { getProductDrawKind } from '../lib/dormChecklist';
import { downloadCatalogModelByKind } from '../lib/modelStorage';
import { Button, Eyebrow, MonoMeta, SectionOpener } from './kit';

interface ProductDrawerProps {
  categoryName: string;
  products: CuratedProduct[];
  canPlace: boolean;
  onClose: () => void;
  onAddToList: (product: CuratedProduct) => void;
  onPlace?: (product: CuratedProduct) => void;
  placeHint?: string | null;
  /** Admin manage mode: show Add product and edit actions. */
  adminMode?: boolean;
  onAddProduct?: () => void;
  onEditProduct?: (product: CuratedProduct) => void;
  onDeleteProduct?: (product: CuratedProduct) => void;
  onEditCategory?: () => void;
  lineStatus?: ChecklistLineStatus;
  onSetResolution?: (resolution: 'have' | 'skip' | null) => void;
}

export function ProductDrawer({
  categoryName,
  products,
  canPlace,
  onClose,
  onAddToList,
  onPlace,
  placeHint,
  adminMode = false,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onEditCategory,
  lineStatus,
  onSetResolution,
}: ProductDrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const { user } = useAuth();
  const canDownloadGlb = adminMode || !!user?.id;
  const [downloadKind, setDownloadKind] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownloadGlb(product: CuratedProduct) {
    if (!canDownloadGlb || !product.placeCatalogKind || downloadKind) return;
    setDownloadError(null);
    setDownloadKind(product.placeCatalogKind);
    try {
      await downloadCatalogModelByKind(product.placeCatalogKind, product.name);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Could not download model');
    } finally {
      setDownloadKind(null);
    }
  }

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
        className={`product-drawer${adminMode ? ' product-drawer--admin' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={`product-drawer-head${adminMode ? ' product-drawer-head--admin' : ''}`}>
          <div>
            <Eyebrow level="section">{adminMode ? 'Manage products' : 'Curated picks'}</Eyebrow>
            <SectionOpener level={5} title={`${categoryName}.`} id={titleId} style={{ marginTop: 8 }} />
          </div>
          <div className="product-drawer-head-actions">
            {adminMode && onEditCategory ? (
              <Button size="sm" variant="outline" onClick={onEditCategory}>
                Edit category
              </Button>
            ) : null}
            {adminMode && onAddProduct ? (
              <Button size="sm" onClick={onAddProduct}>
                Add product
              </Button>
            ) : null}
            <button
              ref={closeRef}
              type="button"
              className="kit-modal__close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </header>

        {!adminMode && lineStatus && onSetResolution ? (
          <ChecklistResolutionActions
            status={lineStatus}
            onHave={() => onSetResolution('have')}
            onSkip={() => onSetResolution('skip')}
            onUndo={() => onSetResolution(null)}
            className="product-drawer-resolution"
          />
        ) : null}

        {downloadError ? (
          <p className="product-drawer-hint" role="alert" style={{ margin: '0 0 8px' }}>
            {downloadError}
          </p>
        ) : null}

        {products.length === 0 ? (
          <div className="product-drawer-empty-wrap">
            <p className="product-drawer-empty" style={{ padding: '8px 0 0', margin: 0 }}>
              {adminMode ? 'No products yet. Add one to get started.' : 'Products coming soon for this item.'}
            </p>
            {adminMode && onAddProduct ? (
              <Button size="sm" onClick={onAddProduct} style={{ marginTop: 16 }}>
                Add product
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="product-drawer-grid">
            {products.map((product) => {
              const price = formatPriceCents(product.priceCents, product.currency);
              const shopUrl = product.affiliateUrl?.trim();
              const placeable = canPlace && productHasPlaceableModel(product);
              const recommended = /recommended/i.test(product.name) || /recommended/i.test(product.description);
              return (
                <li
                  key={product.id}
                  className={`product-drawer-card${adminMode ? ' product-drawer-card--admin' : ''}`}
                >
                  <div className="product-drawer-media" aria-hidden>
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" referrerPolicy="no-referrer" />
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
                        <span className="product-drawer-price product-drawer-price--na">—</span>
                      )}
                    </div>
                    {!product.published && adminMode ? (
                      <MonoMeta size="xs" tone="dense">Draft</MonoMeta>
                    ) : null}
                    {recommended ? (
                      <MonoMeta size="xs" tone="dense" upper>
                        Recommended
                      </MonoMeta>
                    ) : null}
                    {product.description ? (
                      <p className="product-drawer-desc">{product.description}</p>
                    ) : null}
                    <div className="product-drawer-actions">
                      {adminMode ? (
                        <>
                          {onEditProduct ? (
                            <Button size="sm" variant="outline" onClick={() => onEditProduct(product)}>
                              Edit
                            </Button>
                          ) : null}
                          {canDownloadGlb && product.placeCatalogKind ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={downloadKind === product.placeCatalogKind}
                              onClick={() => void handleDownloadGlb(product)}
                            >
                              {downloadKind === product.placeCatalogKind
                                ? 'Downloading…'
                                : 'Download GLB'}
                            </Button>
                          ) : null}
                          {onDeleteProduct ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onDeleteProduct(product)}
                              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                            >
                              Delete
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => onAddToList(product)}>
                            Add to list
                          </Button>
                          {shopUrl ? (
                            <a
                              className="kit-btn kit-btn--primary kit-btn--sm"
                              href={shopUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() =>
                                trackAffiliateClicked({
                                  retailer: product.retailer,
                                  product_id: product.id,
                                  is_price_approximate: false,
                                  source: 'product_drawer',
                                })
                              }
                            >
                              Shop
                            </a>
                          ) : null}
                          {canDownloadGlb && product.placeCatalogKind ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={downloadKind === product.placeCatalogKind}
                              onClick={() => void handleDownloadGlb(product)}
                            >
                              {downloadKind === product.placeCatalogKind
                                ? 'Downloading…'
                                : 'Download GLB'}
                            </Button>
                          ) : null}
                          {placeable && onPlace ? (
                            <Button size="sm" variant="mono" onClick={() => onPlace(product)}>
                              {getProductDrawKind(product) ? 'Draw in room' : 'Place in room'}
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                    {!adminMode && !canPlace && productHasPlaceableModel(product) ? (
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

        {!adminMode ? (
          <MonoMeta size="xs" tone="subtle" className="product-drawer-disclaimer">
            As an Amazon Associate, Toova may earn from qualifying purchases. Displayed prices
            may change on the retailer site.
          </MonoMeta>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
