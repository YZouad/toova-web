import { useEffect, useRef, useState } from 'react';
import { startCheckout, type CheckoutKind } from '../../lib/billing';
import { trackCheckoutStarted } from '../../lib/analytics';
import { useEntitlements } from '../../hooks/useEntitlements';
import { navigate, pricingPath } from '../../hooks/useRoute';
import { formatUsd, PLAN_OFFERS, TOPUP_OFFERS } from '../billing/planCatalog';

interface CreditMenuBodyProps {
  onDone: () => void;
}

export function CreditMenuBody({ onDone }: CreditMenuBodyProps) {
  const { creditsTotal, billing, loading } = useEntitlements();
  const [busy, setBusy] = useState<CheckoutKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tier = billing?.tier ?? 'free';

  const upgrades = PLAN_OFFERS.filter((plan) => {
    if (tier === 'pro') return false;
    if (tier === 'lite') return plan.tier === 'pro';
    return true;
  });

  async function checkout(kind: CheckoutKind) {
    setBusy(kind);
    setError(null);
    trackCheckoutStarted({ kind, context: 'designer' });
    try {
      const url = await startCheckout(kind);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setBusy(null);
    }
  }

  const planLine = billing
    ? `${billing.display_name} · ${billing.monthly_balance} monthly · ${billing.purchased_balance} purchased`
    : 'Free';

  return (
    <div className="dg-credits-body">
      <p className="dg-credits-balance">
        {loading && !billing ? '…' : creditsTotal}
        <span> available</span>
      </p>
      <p className="dg-credits-plan">{planLine}</p>

      <div className="dg-more-menu__section">Top up</div>
      {TOPUP_OFFERS.map((pack) => (
        <button
          key={pack.kind}
          type="button"
          className="dg-credits-pack"
          role="menuitem"
          disabled={Boolean(busy)}
          onClick={() => void checkout(pack.kind)}
        >
          <span className="dg-credits-pack__copy">
            <span className="dg-credits-pack__name">{pack.name}</span>
            <span className="dg-credits-pack__detail">{pack.detail}</span>
          </span>
          <span className="dg-credits-pack__price">
            {busy === pack.kind ? 'Opening…' : formatUsd(pack.cents)}
          </span>
        </button>
      ))}
      <p className="dg-credits-note">Purchased credits do not expire.</p>

      {upgrades.length > 0 ? (
        <>
          <div className="dg-more-menu__rule" aria-hidden />
          <div className="dg-more-menu__section">Plans</div>
          {upgrades.map((plan) => (
            <button
              key={plan.tier}
              type="button"
              className="dg-credits-pack"
              role="menuitem"
              disabled={Boolean(busy)}
              onClick={() => void checkout(plan.checkout.monthly)}
            >
              <span className="dg-credits-pack__copy">
                <span className="dg-credits-pack__name">{plan.name}</span>
                <span className="dg-credits-pack__detail">
                  {plan.features
                    .filter((feature) => feature.included)
                    .slice(0, 2)
                    .map((feature) => feature.label)
                    .join(' · ')}
                </span>
              </span>
              <span className="dg-credits-pack__price">
                {busy === plan.checkout.monthly ? 'Opening…' : `${formatUsd(plan.monthlyCents)}/mo`}
              </span>
            </button>
          ))}
        </>
      ) : null}

      {error ? (
        <p className="dg-credits-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="dg-more-menu__rule" aria-hidden />
      <button
        type="button"
        className="dg-more-menu__item"
        role="menuitem"
        onClick={() => {
          onDone();
          navigate(pricingPath());
        }}
      >
        Compare plans
      </button>
    </div>
  );
}

interface CreditTopUpMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Desktop top-bar credit control. Opens a menu in the same language as More. */
export function CreditTopUpMenu({ open, onOpenChange }: CreditTopUpMenuProps) {
  const { creditsTotal, billing, loading } = useEntitlements();
  const rootRef = useRef<HTMLDivElement>(null);
  const low = !loading && creditsTotal <= 10;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open, onOpenChange]);

  return (
    <div className="dg-credits" ref={rootRef}>
      <button
        type="button"
        className={`dg-credits-trigger${low ? ' is-low' : ''}${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Credits and top up"
        onClick={() => onOpenChange(!open)}
      >
        <span className="dg-credits-trigger__count">
          {loading && !billing ? '…' : creditsTotal}
        </span>
        <span>credits</span>
        {low ? <span className="dg-credits-trigger__action">Top up</span> : null}
      </button>
      {open ? (
        <div className="dg-credits-menu" role="menu" aria-label="Top up credits">
          <CreditMenuBody onDone={() => onOpenChange(false)} />
        </div>
      ) : null}
    </div>
  );
}
