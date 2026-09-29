import { useState } from 'react';
import {
  openBillingPortal,
  startCheckout,
  type CheckoutKind,
} from '../../lib/billing';
import { useEntitlements } from '../../hooks/useEntitlements';
import { navigate } from '../../hooks/useRoute';
import { trackCheckoutStarted } from '../../lib/analytics';
import { Button } from '../kit/Button';
import { DisplayHeading } from '../kit/DisplayHeading';
import { MonoMeta } from '../kit/MonoMeta';

const PLANS = [
  {
    tier: 'free',
    name: 'Free',
    price: '$0',
    detail: '5 rooms · 15 credits/mo · watermarked exports · 14-day share links',
    features: ['Photo-to-3D with credits', 'Affiliate shopping lists', 'Public gallery'],
  },
  {
    tier: 'lite',
    name: 'Lite',
    price: '$2.99/mo',
    detail: '15 rooms · 60 credits/mo · no watermark · 90-day share links',
    checkout: 'lite_monthly' as CheckoutKind,
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: '$7.99/mo',
    detail: 'Unlimited rooms · 250 credits/mo · 4K exports · AR/USDZ · permanent shares',
    checkout: 'pro_monthly' as CheckoutKind,
  },
];

const TOPUPS: { kind: CheckoutKind; label: string }[] = [
  { kind: 'topup_50', label: '50 credits — $3.99' },
  { kind: 'topup_150', label: '150 credits — $9.99' },
  { kind: 'topup_400', label: '400 credits — $19.99' },
];

interface PricingPageProps {
  onBack?: () => void;
}

export function PricingPage({ onBack }: PricingPageProps) {
  const { billing, creditsTotal, refresh } = useEntitlements();
  const [busy, setBusy] = useState<CheckoutKind | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(kind: CheckoutKind) {
    setBusy(kind);
    setError(null);
    trackCheckoutStarted({ kind, context: 'pricing' });
    try {
      const url = await startCheckout(kind);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setBusy(null);
    }
  }

  async function portal() {
    setBusy('portal');
    setError(null);
    try {
      const url = await openBillingPortal(window.location.href);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open portal');
      setBusy(null);
    }
  }

  return (
    <div className="tv-pricing-page" style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>
      {onBack ? (
        <Button size="sm" variant="outline" onClick={onBack} style={{ marginBottom: 16 }}>
          Back
        </Button>
      ) : null}
      <DisplayHeading level={1}>
        Plans & credits
      </DisplayHeading>
      <p style={{ lineHeight: 1.5, maxWidth: 560 }}>
        Credits power Trellis photo-to-3D on Toova. Thrixel stays bring-your-own-key. Monthly credits
        reset each billing period; purchased top-ups never expire.
      </p>
      {billing ? (
        <MonoMeta style={{ display: 'block', marginBottom: 24 }}>
          Current plan: {billing.display_name} · {creditsTotal} credits available
        </MonoMeta>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
        {PLANS.map((plan) => (
          <article
            key={plan.tier}
            style={{
              border: '1px solid var(--rule-soft)',
              padding: '18px 20px',
              background: billing?.tier === plan.tier ? 'var(--paper-warm)' : 'var(--bg-raised)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <DisplayHeading level={3}>
                {plan.name}
              </DisplayHeading>
              <MonoMeta>{plan.price}</MonoMeta>
            </div>
            <p style={{ margin: '8px 0 12px' }}>{plan.detail}</p>
            {'checkout' in plan && plan.checkout ? (
              <Button
                size="sm"
                disabled={Boolean(busy) || billing?.tier === plan.tier}
                onClick={() => void checkout(plan.checkout!)}
              >
                {busy === plan.checkout ? 'Opening checkout…' : `Choose ${plan.name}`}
              </Button>
            ) : null}
          </article>
        ))}
      </div>

      <DisplayHeading level={3}>
        Credit top-ups
      </DisplayHeading>
      <p style={{ lineHeight: 1.5 }}>Available on every plan. Spent after your monthly allowance.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0 24px' }}>
        {TOPUPS.map((t) => (
          <Button
            key={t.kind}
            size="sm"
            variant="outline"
            disabled={Boolean(busy)}
            onClick={() => void checkout(t.kind)}
          >
            {busy === t.kind ? 'Opening checkout…' : t.label}
          </Button>
        ))}
      </div>

      <DisplayHeading level={3}>
        Semester Pass
      </DisplayHeading>
      <p style={{ lineHeight: 1.5, marginBottom: 12 }}>
        Five months of Pro without a subscription — $24.99 one-time.
      </p>
      <Button
        size="sm"
        disabled={Boolean(busy)}
        onClick={() => void checkout('semester_pass')}
      >
        {busy === 'semester_pass' ? 'Opening checkout…' : 'Get Semester Pass'}
      </Button>

      {billing?.subscription?.source === 'subscription' ? (
        <div style={{ marginTop: 32 }}>
          <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void portal()}>
            {busy === 'portal' ? 'Opening…' : 'Manage subscription'}
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="tv-banner-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : null}

      <Button
        size="sm"
        variant="outline"
        style={{ marginTop: 24 }}
        onClick={() => void refresh()}
      >
        Refresh balance
      </Button>
    </div>
  );
}

export function openPricingPage(): void {
  navigate('/pricing');
}
