import { useEffect, useState } from 'react';
import {
  amazonMultiAddCartUrl,
  parseAsinFromAffiliateUrl,
  type AmazonCartLine,
} from '../../lib/affiliateLinks';
import {
  bundleItemAsCuratedProduct,
  fetchPublishedBundles,
  type ProductBundle,
} from '../../lib/bundles';
import {
  trackAffiliateClicked,
  trackBundleAddedToRoom,
  trackBundleCartClicked,
  trackBundleViewed,
} from '../../lib/analytics';
import { Button } from '../kit/Button';
import { DisplayHeading } from '../kit/DisplayHeading';
import { MonoMeta } from '../kit/MonoMeta';
import { Spinner } from '../kit/Spinner';

interface BundleCardsProps {
  onAddProductToRoom?: (productId: string) => void;
}

export function BundleCards({ onAddProductToRoom }: BundleCardsProps) {
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

  if (loading) return <Spinner label="Loading bundles…" />;
  if (bundles.length === 0) return null;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <DisplayHeading level={3}>
        Room bundles
      </DisplayHeading>
      <p style={{ margin: 0, maxWidth: 520, lineHeight: 1.5 }}>
        Curated dorm packs — add the whole set to your room, then buy everything on Amazon in one cart.
      </p>
      {bundles.map((bundle) => (
        <BundleCard
          key={bundle.id}
          bundle={bundle}
          onAddProductToRoom={onAddProductToRoom}
        />
      ))}
    </section>
  );
}

function BundleCard({
  bundle,
  onAddProductToRoom,
}: {
  bundle: ProductBundle;
  onAddProductToRoom?: (productId: string) => void;
}) {
  useEffect(() => {
    trackBundleViewed({ bundle_slug: bundle.slug });
  }, [bundle.slug]);

  const amazonLines: AmazonCartLine[] = bundle.items
    .map((item) => {
      const asin =
        item.product.asin?.trim() ||
        parseAsinFromAffiliateUrl(item.product.affiliate_url) ||
        '';
      return { asin, quantity: item.quantity, label: item.product.name };
    })
    .filter((l) => l.asin.length === 10);

  const cartUrl = amazonMultiAddCartUrl(amazonLines);
  const otherRetailers = bundle.items.filter(
    (i) => i.product.retailer.toLowerCase() !== 'amazon',
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
      onAddProductToRoom(bundleItemAsCuratedProduct(item).id);
    }
    trackBundleAddedToRoom({ bundle_slug: bundle.slug, item_count: bundle.items.length });
  }

  return (
    <article
      style={{
        border: '1px solid var(--rule-soft)',
        padding: '16px 18px',
        background: 'var(--bg-raised)',
      }}
    >
      <DisplayHeading level={4}>
        {bundle.title}
      </DisplayHeading>
      {bundle.description ? (
        <p style={{ margin: '8px 0 12px', lineHeight: 1.45 }}>{bundle.description}</p>
      ) : null}
      <MonoMeta>{bundle.items.length} items</MonoMeta>
      <ul style={{ margin: '12px 0', paddingLeft: 18 }}>
        {bundle.items.map((item) => (
          <li key={item.product_id}>
            {item.quantity > 1 ? `${item.quantity}× ` : ''}
            {item.product.name}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
        <div style={{ marginTop: 12 }}>
          <MonoMeta>Also from other stores:</MonoMeta>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {otherRetailers.map((item) => (
              <li key={item.product_id}>
                <a href={item.product.affiliate_url} target="_blank" rel="noopener noreferrer">
                  {item.product.name} ({item.product.retailer})
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
