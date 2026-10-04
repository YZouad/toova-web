import { searchOffersForQuery } from '../lib/affiliateLinks';
import { trackAffiliateClicked } from '../lib/analytics';

interface ManifestSearchLinksProps {
  query: string;
  source?: 'agentic_room' | 'designer_checklist_ticker' | 'checklist_checkout';
  /** `links` = compact text chips (checklist/checkout). `buttons` = full kit buttons. */
  variant?: 'links' | 'buttons';
}

function shortLabel(retailer?: string, fallback?: string): string {
  if (retailer === 'Amazon') return 'Amazon';
  if (retailer === 'Google') return 'Google';
  return fallback?.replace(/^Search\s+/i, '') ?? 'Search';
}

export function ManifestSearchLinks({
  query,
  source = 'checklist_checkout',
  variant = 'links',
}: ManifestSearchLinksProps) {
  const offers = searchOffersForQuery(query);
  if (offers.length === 0) return null;

  if (variant === 'buttons') {
    return (
      <span className="manifest-search-links manifest-search-links--buttons">
        {offers.map((offer) => (
          <a
            key={offer.url}
            className="kit-btn kit-btn--sm kit-btn--outline"
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackAffiliateClicked({
                retailer: offer.retailer,
                is_price_approximate: offer.approximate,
                source,
              })
            }
          >
            {offer.label}
          </a>
        ))}
      </span>
    );
  }

  return (
    <span className="manifest-search-links" role="group" aria-label={`Search for ${query}`}>
      {offers.map((offer) => (
        <a
          key={offer.url}
          className="manifest-search-links__chip"
          href={offer.url}
          target="_blank"
          rel="noopener noreferrer"
          title={offer.label}
          onClick={() =>
            trackAffiliateClicked({
              retailer: offer.retailer,
              is_price_approximate: offer.approximate,
              source,
            })
          }
        >
          {shortLabel(offer.retailer, offer.label)}
        </a>
      ))}
    </span>
  );
}
