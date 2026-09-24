import { useEffect, useState } from 'react';
import { openBillingPortal, startCreditsCheckout, fetchBillingCatalog } from '../lib/billingApi';
import { trackPlanCancelled, trackPlanUpgraded } from '../lib/analytics';
import { useEntitlements } from '../hooks/useEntitlements';
import { navigate } from '../hooks/useRoute';
import { Button } from './kit/Button';

export function BillingPage({ onBack }: { onBack?: () => void }) {
  const { entitlements, refresh } = useEntitlements();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [packs, setPacks] = useState<
    Array<{ provider_price_id: string; credit_grant: number; amount_cents: number }>
  >([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      const from = params.get('from') || 'free';
      const to = entitlements.plan_code;
      if (to !== 'free') {
        trackPlanUpgraded({
          from_plan: from === 'free' ? 'free' : 'pro',
          to_plan: 'pro',
        });
      }
      void refresh();
      window.history.replaceState(null, '', '/billing');
    }
  }, [entitlements.plan_code, refresh]);

  useEffect(() => {
    void fetchBillingCatalog().then((c) => {
      setPacks(
        c.prices
          .filter((p) => p.interval === 'one_time' && p.is_purchasable && p.credit_grant)
          .map((p) => ({
            provider_price_id: p.provider_price_id,
            credit_grant: p.credit_grant!,
            amount_cents: p.amount_cents,
          })),
      );
    });
  }, []);

  const openPortal = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await openBillingPortal(`${window.location.origin}/billing`);
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open portal.');
      setBusy(false);
    }
  };

  const buyPack = async (priceId: string) => {
    setBusy(true);
    setError(null);
    try {
      const url = await startCreditsCheckout(priceId);
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
      setBusy(false);
    }
  };

  return (
    <div className="billing-page">
      <header className="billing-page__header">
        {onBack ? (
          <button type="button" className="text-btn" onClick={onBack}>
            ← Back
          </button>
        ) : null}
        <h1>Billing</h1>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="billing-page__card">
        <h2>Current plan</h2>
        <p>
          <strong>{entitlements.plan_code}</strong>
          {entitlements.status !== 'none' ? (
            <span className="muted"> · {entitlements.status}</span>
          ) : null}
        </p>
        <p className="muted">
          Credits available: {entitlements.credits_available}
          {entitlements.current_period_end
            ? ` · Period ends ${new Date(entitlements.current_period_end).toLocaleDateString()}`
            : null}
        </p>
        <div className="billing-page__actions">
          <Button type="button" variant="outline" onClick={() => navigate('/pricing')}>
            Change plan
          </Button>
          {entitlements.plan_code !== 'free' ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                trackPlanCancelled({ from_plan: 'pro' });
                void openPortal();
              }}
            >
              Manage subscription
            </Button>
          ) : null}
        </div>
      </section>

      {packs.length > 0 ? (
        <section className="billing-page__card">
          <h2>Credit packs</h2>
          <p className="muted">One-time packs never expire. Subscription grants renew each cycle.</p>
          <ul className="billing-page__packs">
            {packs.map((p) => (
              <li key={p.provider_price_id}>
                <span>
                  {p.credit_grant} credits
                  {p.amount_cents > 0 ? ` · $${(p.amount_cents / 100).toFixed(0)}` : ''}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void buyPack(p.provider_price_id)}
                >
                  Buy
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
