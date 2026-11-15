import { useEffect, useState } from 'react';
import { shopUrlForProduct, amazonMultiAddCartUrl, parseAsinFromAffiliateUrl, type AmazonCartLine } from '../../lib/affiliateLinks';
import {
  bundleItemAsCuratedProduct,
  fetchPublishedBundles,
  type BundleItemRow,
  type ProductBundle,
} from '../../lib/bundles';
import {
  trackAffiliateClicked,
  trackBundleAddedToRoom,
  trackBundleCartClicked,
  trackBundleViewed,
} from '../../lib/analytics';
import { formatPriceCents, type CuratedProduct } from '../../lib/dormChecklist';
import { Button } from '../kit/Button';
import { Eyebrow } from '../kit/Eyebrow';
import { MonoMeta } from '../kit/MonoMeta';
import { SectionOpener } from '../kit/SectionOpener';
import { Spinner } from '../kit/Spinner';

interface BundleCardsProps {
  productsById?: Record<string, CuratedProduct>;
  onAddProductToRoom?: (productId: string) => void;
  onRequestAddToList?: (product: CuratedProduct) => void;
  canPlace?: boolean;
  onPlace?: (product: CuratedProduct) => void;
}

function productForItem(
  item: BundleItemRow,
  productsById?: Record<string, CuratedProduct>,
): CuratedProduct {
  return productsById?.[item.product_id] ?? bundleItemAsCuratedProduct(item);
}

export function BundleCards({
  productsById,
  onAddProductToRoom,
  onRequestAddToList,
  canPlace = false,
  onPlace,
}: BundleCardsProps) {
  const [bundles, setBundles] = useState<ProductBundle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const rows = await fetchPublishedBundles();
      setBundles(rows);
      setLoading(false);
    })();
  }, []);

  if (loading) return <Spinner label="Loading room bundles…" />;
  if (bundles.length === 0) {
    return (
      <section className="bundle-cards">
        <Eyebrow level="page">Toova checklist</Eyebrow>
        <SectionOpener level={3} title="Room bundles." note="Coming soon" />
        <p className="bundle-cards__lede">
          Curated dorm packs will show here — add a whole set to your room, then buy everything on
          Amazon in one cart.
        </p>
      </section>
    );
  }

  return (
    <section className="bundle-cards">
      <Eyebrow level="page">Toova checklist</Eyebrow>
      <SectionOpener level={3} title="Room bundles." note="Dorm packs" />
      <p className="bundle-cards__lede">
        Curated dorm packs — add pieces to any checklist, then buy the set on Amazon in one cart.
      </p>
      {bundles.map((bundle) => (
        <BundleCard
          key={bundle.id}
          bundle={bundle}
          productsById={productsById}
          onAddProductToRoom={onAddProductToRoom}
          onRequestAddToList={onRequestAddToList}
          canPlace={canPlace}
          onPlace={onPlace}
        />
      ))}
    </section>
  );
}

function BundleCard({
  bundle,
  productsById,
  onAddProductToRoom,
  onRequestAddToList,
  canPlace,
  onPlace,
}: {
  bundle: ProductBundle;
  productsById?: Record<string, CuratedProduct>;
  onAddProductToRoom?: (productId: string) => void;
  onRequestAddToList?: (product: CuratedProduct) => void;
  canPlace: boolean;
  onPlace?: (product: CuratedProduct) => void;
}) {
  useEffect(() => {
    trackBundleViewed({ bundle_slug: bundle.slug });
  }, [bundle.slug]);

  const products = bundle.items.map((item) => productForItem(item, productsById));

  const amazonLines: AmazonCartLine[] = bundle.items
    .map((item) => {
      const product = productForItem(item, productsById);
      const asin =
        product.asin?.trim() ||
        parseAsinFromAffiliateUrl(product.affiliateUrl) ||
        '';
      return { asin, quantity: item.quantity, label: product.name };
    })
    .filter((l) => l.asin.length === 10);

  const cartUrl = amazonMultiAddCartUrl(amazonLines);
  const otherRetailers = products.filter(
    (p) => p.retailer.toLowerCase() !== 'amazon',
  );

  function handleCartClick() {
    trackBundleCartClicked({ bundle_slug: bundle.slug, item_count: bundle.items.length });
    trackAffiliateClicked({
      retailer: 'Amazon',
      is_price_approximate: false,
      source: 'bundle_cart',
    });
    if (cartUrl) window.open(cartUrl, '_blank', 'noopener,noreferrer');
  }

  function handleAddAll() {
    if (!onAddProductToRoom) return;
    for (const item of bundle.items) {
      onAddProductToRoom(item.product_id);
    }
    trackBundleAddedToRoom({ bundle_slug: bundle.slug, item_count: bundle.items.length });
  }

  return (
    <article className="bundle-card">
      <header className="bundle-card__head">
        <h3 className="bundle-card__title">{bundle.title}</h3>
        {bundle.description ? (
          <p className="bundle-card__desc">{bundle.description}</p>
        ) : null}
        <MonoMeta size="sm" tone="dense">
          {bundle.items.length} item{bundle.items.length === 1 ? '' : 's'}
        </MonoMeta>
      </header>

      <div className="bundle-card__products" role="list">
        {bundle.items.map((item) => {
          const product = productForItem(item, productsById);
          const shop = shopUrlForProduct(product);
          const price = formatPriceCents(product.priceCents, product.currency);
          return (
            <article key={item.product_id} className="checklist-product-rail__card" role="listitem">
              <div className="checklist-product-rail__media" aria-hidden={!product.imageUrl}>
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  product.name.slice(0, 1)
                )}
              </div>
              <div className="checklist-product-rail__body">
                <span className="checklist-product-rail__name">
                  {item.quantity > 1 ? `${item.quantity}× ` : ''}
                  {product.name}
                </span>
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
                          source: 'bundle_cart',
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
      </div>

      <div className="bundle-card__actions">
        {cartUrl ? (
          <Button size="sm" onClick={handleCartClick}>
            Buy bundle on Amazon
          </Button>
        ) : null}
        {onAddProductToRoom ? (
          <Button size="sm" variant="outline" onClick={handleAddAll}>
            Add bundle to room
          </Button>
        ) : null}
      </div>
      {otherRetailers.length > 0 ? (
        <div className="bundle-card__other">
          <MonoMeta>Also from other stores:</MonoMeta>
          <ul>
            {otherRetailers.map((product) => (
              <li key={product.id}>
                <a href={product.affiliateUrl} target="_blank" rel="noopener noreferrer">
                  {product.name} ({product.retailer})
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
