import { useMemo, useState } from 'react';
import { shopUrlForProduct } from '../../lib/affiliateLinks';
import { trackAffiliateClicked } from '../../lib/analytics';
import {
  checklistLineStatus,
  formatPriceCents,
  type CategoryResolution,
  type ChecklistCategoryWithProducts,
  type CuratedProduct,
} from '../../lib/dormChecklist';
import { categoryGuideTips, categoryGuideWhy } from '../../lib/checklistCategoryGuide';
import { Button, Eyebrow, MonoMeta } from '../kit';
import {
  ChecklistResolutionActions,
} from '../designer/ChecklistBudgetFoot';
import type { ChecklistInspoClip } from '../../lib/inspoClipUrls';
import {
  InspoClipBrowseCard,
  InspoClipCard,
  visibleInspoClips,
} from './InspoClipCard';
import { SaveInspoClipModal } from './SaveInspoClipModal';

interface ChecklistItemSectionProps {
  category: ChecklistCategoryWithProducts;
  placed: boolean;
  resolution: CategoryResolution | undefined;
  ownedProduct?: CuratedProduct | null;
  canPlace: boolean;
  userId?: string | null;
  isAdmin?: boolean;
  onRequestSignIn?: () => void;
  onRequestAddToList?: (product: CuratedProduct) => void;
  onPlace?: (product: CuratedProduct) => void;
  onMarkOwned?: (input: { name: string; affiliateUrl: string; priceCents: number }) => void;
  onSkip?: () => void;
  onUndo?: () => void;
  setResolution?: (categoryId: string, resolution: CategoryResolution | null) => Promise<void>;
  onUseInspoLook?: (category: ChecklistCategoryWithProducts, clip: ChecklistInspoClip) => void;
  onInspoClipSubmitted?: () => void;
}

function publishedProducts(products: CuratedProduct[]): CuratedProduct[] {
  const live = products.filter((p) => p.published);
  return live.length > 0 ? live : products;
}

export function ChecklistItemSection({
  category,
  placed,
  resolution,
  ownedProduct,
  canPlace,
  userId = null,
  isAdmin = false,
  onRequestSignIn,
  onRequestAddToList,
  onPlace,
  onMarkOwned,
  onSkip,
  onUndo,
  onUseInspoLook,
  onInspoClipSubmitted,
}: ChecklistItemSectionProps) {
  const [inspoSubmitOpen, setInspoSubmitOpen] = useState(false);
  const products = publishedProducts(category.products);
  const visibleClips = useMemo(
    () => visibleInspoClips(category.inspoClips ?? [], userId),
    [category.inspoClips, userId],
  );
  const inspoEnabled = Boolean(onUseInspoLook);
  const showPicksRail =
    products.length > 0 || visibleClips.length > 0 || inspoEnabled;
  const done = placed || resolution === 'have' || resolution === 'skip';
  const lineStatus = checklistLineStatus(placed, resolution);

  function openSaveInspo() {
    if (!userId) {
      onRequestSignIn?.();
      return;
    }
    setInspoSubmitOpen(true);
  }

  return (
    <section
      className={`checklist-item-section${done ? ' checklist-item-section--done' : ''}`}
      id={`checklist-cat-${category.id}`}
      aria-labelledby={`checklist-cat-title-${category.id}`}
    >
      <header className="checklist-item-section__head">
        <Eyebrow>{done ? 'Resolved' : 'Up next'}</Eyebrow>
        <h2 className="checklist-item-section__title" id={`checklist-cat-title-${category.id}`}>
          {category.name}
        </h2>
      </header>

      <div className="checklist-item-section__why">
        <p>{categoryGuideWhy(category)}</p>
      </div>

      {!showPicksRail ? (
        <p className="checklist-item-section__empty">Product options coming soon for this category.</p>
      ) : (
        <div className="checklist-product-rail checklist-product-rail--unified">
          <div className="checklist-product-rail__head">
            <MonoMeta size="xs" tone="dense" upper>
              Options &amp; inspo
            </MonoMeta>
            {inspoEnabled ? (
              <button type="button" className="shopping-lists-header-link" onClick={openSaveInspo}>
                Save a link
              </button>
            ) : null}
          </div>
          <div
            className="checklist-product-rail__track"
            tabIndex={0}
            aria-label={`${category.name} products and inspo`}
          >
            {products.map((product) => {
              const shop = shopUrlForProduct(product);
              const price = formatPriceCents(product.priceCents, product.currency);
              return (
                <article key={product.id} className="checklist-product-rail__card">
                  <div className="checklist-product-rail__media" aria-hidden={!product.imageUrl}>
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" loading="lazy" />
                    ) : (
                      product.name.slice(0, 1)
                    )}
                  </div>
                  <div className="checklist-product-rail__body">
                    <span className="checklist-product-rail__name">{product.name}</span>
                    {price ? (
                      <MonoMeta size="sm" tone="dense">
                        {price}
                      </MonoMeta>
                    ) : null}
                    {product.description ? (
                      <p className="checklist-product-rail__desc">{product.description}</p>
                    ) : null}
                    <div className="checklist-product-rail__actions">
                      {onRequestAddToList ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onRequestAddToList(product)}
                        >
                          Add to checklist
                        </Button>
                      ) : null}
                      {canPlace && onPlace && product.placeBuiltinKind ? (
                        <Button size="sm" onClick={() => onPlace(product)}>
                          Place in room
                        </Button>
                      ) : null}
                      {shop.url ? (
                        <a
                          className="checklist-product-rail__shop"
                          href={shop.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            trackAffiliateClicked({
                              product_id: product.id,
                              retailer: product.retailer,
                              is_price_approximate: product.priceCents == null,
                              source: 'checklist_top_picks',
                            })
                          }
                        >
                          {shop.label}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
            {inspoEnabled
              ? visibleClips.map((clip) => (
                  <InspoClipCard
                    key={clip.id}
                    clip={clip}
                    categoryName={category.name}
                    userId={userId}
                    onUseThisLook={(c) => onUseInspoLook!(category, c)}
                  />
                ))
              : null}
            {inspoEnabled && visibleClips.length === 0 ? (
              <InspoClipBrowseCard categoryName={category.name} />
            ) : null}
          </div>
        </div>
      )}

      {inspoEnabled ? (
        <SaveInspoClipModal
          open={inspoSubmitOpen}
          categoryId={category.id}
          categoryName={category.name}
          userId={userId}
          isAdmin={isAdmin}
          onClose={() => setInspoSubmitOpen(false)}
          onRequestSignIn={onRequestSignIn}
          onSubmitted={onInspoClipSubmitted}
        />
      ) : null}

      {categoryGuideTips(category).length > 0 ? (
        <aside className="checklist-tips" aria-label="Shopping tips">
          <ul>
            {categoryGuideTips(category).map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </aside>
      ) : null}

      {!done && onMarkOwned && onSkip && onUndo ? (
        <div className="checklist-item-section__resolve">
          <ChecklistResolutionActions
            status={lineStatus}
            categoryName={category.name}
            ownedProduct={ownedProduct}
            onMarkOwned={onMarkOwned}
            onSkip={onSkip}
            onUndo={onUndo}
          />
        </div>
      ) : null}
    </section>
  );
}