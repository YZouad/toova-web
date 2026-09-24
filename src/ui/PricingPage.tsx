import { useEffect, useMemo, useState } from 'react';
import {
  fetchBillingCatalog,
  startPlanCheckout,
  type CatalogEntitlement,
  type CatalogPlan,
  type CatalogPrice,
} from '../lib/billingApi';
import { useAuth } from '../hooks/useAuth';
import { useEntitlements } from '../hooks/useEntitlements';
import { navigate } from '../hooks/useRoute';
import { Button } from './kit/Button';

function formatMoney(cents: number, currency: string): string {
  if (cents <= 0) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

function featureLabel(key: string, limit: number | null, flag: boolean | null): string | null {
  switch (key) {
    case 'max_rooms':
      return limit == null ? 'Unlimited rooms' : `${limit} rooms`;
    case 'monthly_credits':
      return `${limit ?? 0} AI credits / month`;
    case 'export_max_px':
      return limit == null ? 'Full-resolution export' : `Export up to ${limit}px`;
    case 'export_watermark':
      return flag ? 'Watermarked exports' : 'No export watermark';
    case 'ar_usdz_export':
      return flag ? 'AR / USDZ export' : null;
    case 'share_link_max_days':
      return limit == null ? 'Permanent share links' : `Share links last ${limit} days`;
    default:
      return null;
  }
}

export function PricingPage({ onBack }: { onBack?: () => void }) {
  const { user } = useAuth();
  const { entitlements, refresh } = useEntitlements();
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [prices, setPrices] = useState<CatalogPrice[]>([]);
  const [ents, setEnts] = useState<CatalogEntitlement[]>([]);
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [student, setStudent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBillingCatalog()
      .then((c) => {
        setPlans(c.plans);
        setPrices(c.prices);
        setEnts(c.entitlements);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load plans.'));
  }, []);

  const ordered = useMemo(
    () => [...plans].sort((a, b) => a.tier_rank - b.tier_rank),
    [plans],
  );

  const priceFor = (planCode: string): CatalogPrice | undefined =>
    prices.find(
      (p) =>
        p.plan_code === planCode &&
        p.interval === interval &&
        p.audience === (student ? 'student' : 'public') &&
        p.is_purchasable,
    );

  const bulletsFor = (planCode: string): string[] =>
    ents
      .filter((e) => e.plan_code === planCode)
      .map((e) => featureLabel(e.feature_key, e.limit_value, e.flag_value))
      .filter((x): x is string => Boolean(x));

  const handleCheckout = async (planCode: string) => {
    if (!user) {
      navigate('/');
      return;
    }
    setBusy(planCode);
    setError(null);
    try {
      const url = await startPlanCheckout({ planCode, interval, student });
      await refresh();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed.');
      setBusy(null);
    }
  };

  return (
    <div className="pricing-page">
      <header className="pricing-page__header">
        {onBack ? (
          <button type="button" className="text-btn" onClick={onBack}>
            ← Back
          </button>
        ) : null}
        <h1>Pricing</h1>
        <p className="muted">
          Free forever for the basics. Lite removes the friction. Studio unlocks AR and unlimited
          rooms.
        </p>
        <div className="pricing-page__toggles">
          <div className="pricing-page__segment" role="group" aria-label="Billing interval">
            <button
              type="button"
              className={interval === 'month' ? 'is-active' : ''}
              onClick={() => setInterval('month')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={interval === 'year' ? 'is-active' : ''}
              onClick={() => setInterval('year')}
            >
              Annual
            </button>
          </div>
          <label className="pricing-page__student">
            <input
              type="checkbox"
              checked={student}
              onChange={(e) => setStudent(e.target.checked)}
            />
            Student pricing (academic email)
          </label>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="pricing-page__grid">
        {ordered.map((plan) => {
          const price = priceFor(plan.code);
          const current = entitlements.plan_code === plan.code;
          const isFree = plan.code === 'free';
          return (
            <article
              key={plan.code}
              className={`pricing-card${plan.tier_rank === 2 ? ' pricing-card--featured' : ''}`}
            >
              <h2>{plan.display_name}</h2>
              <p className="pricing-card__price">
                {isFree
                  ? '$0'
                  : price
                    ? formatMoney(price.amount_cents, price.currency)
                    : 'Coming soon'}
                {!isFree && price ? (
                  <span className="muted"> / {interval === 'year' ? 'year' : 'month'}</span>
                ) : null}
              </p>
              <ul>
                {bulletsFor(plan.code).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              {isFree ? (
                <Button type="button" variant="ghost" disabled>
                  {current ? 'Current plan' : 'Included'}
                </Button>
              ) : (
                  <Button
                  type="button"
                  variant={plan.tier_rank === 2 ? 'primary' : 'outline'}
                  disabled={current || !price || busy === plan.code}
                  onClick={() => void handleCheckout(plan.code)}
                >
                  {current
                    ? 'Current plan'
                    : !price
                      ? 'Coming soon'
                      : busy === plan.code
                        ? 'Redirecting…'
                        : `Get ${plan.display_name}`}
                </Button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
