import { useState } from 'react';
import { startCheckout, type CheckoutKind } from '../../lib/billing';
import { useEntitlements } from '../../hooks/useEntitlements';
import { trackCheckoutStarted } from '../../lib/analytics';
import { PriceColumn } from '../kit/PriceColumn';
import {
  PLAN_OFFERS,
  formatUsd,
  yearlyMonthlyCents,
  yearlySavingsCents,
  yearlySavingsPercent,
  type BillingInterval,
} from './planCatalog';

interface PlanColumnsProps {
  /** Where checkout events are attributed. */
  context: 'landing' | 'pricing';
  loggedIn?: boolean;
  /** Signed-out visitors cannot start Stripe checkout. */
  onRequireAccount?: () => void;
}

export function PlanColumns({ context, loggedIn = false, onRequireAccount }: PlanColumnsProps) {
  const { billing } = useEntitlements();
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [busy, setBusy] = useState<CheckoutKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savePct = Math.max(...PLAN_OFFERS.map(yearlySavingsPercent));

  async function choose(kind: CheckoutKind) {
    if (!loggedIn) {
      onRequireAccount?.();
      return;
    }
    setBusy(kind);
    setError(null);
    trackCheckoutStarted({ kind, context });
    try {
      const url = await startCheckout(kind);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setBusy(null);
    }
  }

  const lite = PLAN_OFFERS[0];
  const pro = PLAN_OFFERS[1];

  return (
    <div className="plan-columns">
      <div className="plan-interval" role="group" aria-label="Billing period">
        <button
          type="button"
          className={interval === 'monthly' ? 'plan-interval__btn is-active' : 'plan-interval__btn'}
          aria-pressed={interval === 'monthly'}
          onClick={() => setInterval('monthly')}
        >
          Monthly
        </button>
        <button
          type="button"
          className={interval === 'yearly' ? 'plan-interval__btn is-active' : 'plan-interval__btn'}
          aria-pressed={interval === 'yearly'}
          onClick={() => setInterval('yearly')}
        >
          Yearly
          <span className="plan-interval__save">Save up to {savePct}%</span>
        </button>
      </div>

      <p className="plan-columns__savings" aria-live="polite">
        {interval === 'yearly'
          ? `Lite is ${formatUsd(yearlyMonthlyCents(lite))} a month instead of ${formatUsd(lite.monthlyCents)}. Pro is ${formatUsd(yearlyMonthlyCents(pro))} instead of ${formatUsd(pro.monthlyCents)}.`
          : `Switch to yearly and save ${formatUsd(yearlySavingsCents(lite))} on Lite, ${formatUsd(yearlySavingsCents(pro))} on Pro.`}
      </p>

      <div className="toova-grid-2-responsive plan-columns__grid">
        {PLAN_OFFERS.map((plan) => {
          const yearly = interval === 'yearly';
          const kind = plan.checkout[interval];
          const current = billing?.tier === plan.tier;
          const monthlyEquivalent = yearlyMonthlyCents(plan);
          return (
            <PriceColumn
              key={plan.tier}
              name={plan.name}
              current={current}
              price={formatUsd(yearly ? monthlyEquivalent : plan.monthlyCents)}
              compareAt={yearly ? formatUsd(plan.monthlyCents) : undefined}
              priceNote={
                yearly
                  ? `${formatUsd(plan.yearlyCents)} billed yearly · save ${formatUsd(yearlySavingsCents(plan))}`
                  : `${formatUsd(monthlyEquivalent)}/mo on yearly`
              }
              blurb={plan.blurb}
              features={plan.features}
              cta={
                busy === kind
                  ? 'Opening checkout…'
                  : current
                    ? 'Current plan'
                    : `Choose ${plan.name}`
              }
              ctaVariant={plan.tier === 'pro' ? 'primary' : 'outline'}
              ctaDisabled={Boolean(busy) || current}
              onCta={() => void choose(kind)}
            />
          );
        })}
      </div>

      {error ? (
        <div className="tv-banner-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
