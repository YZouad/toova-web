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
import { Eyebrow } from '../kit/Eyebrow';
import { MarketingNav, MarketingNavAuthActions } from '../kit/MarketingNav';
import { MonoMeta } from '../kit/MonoMeta';
import { SectionOpener } from '../kit/SectionOpener';
import { SiteFooter } from '../kit/SiteFooter';
import { PlanColumns } from './PlanColumns';

const TOPUPS: { kind: CheckoutKind; name: string; price: string; detail: string }[] = [
  { kind: 'topup_50', name: '50 credits', price: '$3.99', detail: 'A few extra photo-to-3D runs' },
  { kind: 'topup_150', name: '150 credits', price: '$9.99', detail: 'A busy week of imports' },
  { kind: 'topup_400', name: '400 credits', price: '$19.99', detail: 'A full move-in of new pieces' },
];

interface PricingPageProps {
  loggedIn?: boolean;
  onGoHome: () => void;
  onGetStarted: () => void;
  onLogin: () => void;
  onGoDashboard?: () => void;
  onContact?: () => void;
  onPitchMadness?: () => void;
  onAdmin?: () => void;
}

export function PricingPage({
  loggedIn,
  onGoHome,
  onGetStarted,
  onLogin,
  onGoDashboard,
  onContact,
  onPitchMadness,
  onAdmin,
}: PricingPageProps) {
  const { billing, creditsTotal, refresh } = useEntitlements();
  const [busy, setBusy] = useState<CheckoutKind | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const primaryAction = loggedIn && onGoDashboard ? onGoDashboard : onGetStarted;
  const secondaryAction = loggedIn && onGoDashboard ? onGoDashboard : onLogin;

  async function checkout(kind: CheckoutKind) {
    if (!loggedIn) {
      onLogin();
      return;
    }
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
    <div className="toova-page">
      <div className="toova-paper" aria-hidden />

      <MarketingNav
        brandOnClick={onGoHome}
        links={[
          { label: 'Home', onClick: onGoHome },
          { label: 'Pricing', active: true },
          { label: 'Contact', onClick: onContact },
          { label: loggedIn ? 'Dashboard' : 'Log in', onClick: secondaryAction },
        ]}
        cta={
          <MarketingNavAuthActions
            loggedIn={loggedIn}
            onLogin={secondaryAction}
            onPrimary={primaryAction}
          />
        }
      />

      <div className="toova-frame" style={{ paddingTop: 104, paddingBottom: 40 }}>
        <Eyebrow level="page" style={{ marginBottom: 40 }}>
          Plans
        </Eyebrow>
        <DisplayHeading level={3}>Lite or Pro.</DisplayHeading>
        <p
          style={{
            font: 'var(--type-lead)',
            color: 'var(--ink-2)',
            margin: '28px 0 0',
            maxWidth: 'var(--measure-lead)',
          }}
        >
          Free covers five rooms and 15 credits a month, with a watermark on exports. Lite and Pro
          add rooms, credits, and cleaner files. Monthly credits reset each period. Purchased
          top-ups do not expire.
        </p>
        {billing ? (
          <MonoMeta style={{ display: 'block', marginTop: 20 }}>
            Current plan: {billing.display_name} · {creditsTotal} credits available
          </MonoMeta>
        ) : null}

        <div className="landing-section-pad">
          <PlanColumns context="pricing" loggedIn={loggedIn} onRequireAccount={onLogin} />
        </div>

        <div className="landing-section-pad">
          <SectionOpener title="Credit top-ups." note="Never expire · any plan" />
          <div style={{ borderTop: '1px solid var(--rule-heavy)', marginTop: 28 }}>
            {TOPUPS.map((topup, i) => (
              <div
                key={topup.kind}
                className="pricing-addon"
                style={{
                  borderBottom: i === TOPUPS.length - 1 ? 'none' : '1px solid var(--rule-hair)',
                }}
              >
                <div>
                  <div className="pricing-addon__name">{topup.name}</div>
                  <p className="pricing-addon__detail">{topup.detail}</p>
                </div>
                <MonoMeta size="lg">{topup.price}</MonoMeta>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() => void checkout(topup.kind)}
                >
                  {busy === topup.kind ? 'Opening checkout…' : 'Buy'}
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-section-pad">
          <SectionOpener title="Semester Pass." note="Five months of Pro · no subscription" />
          <div className="pricing-addon" style={{ borderTop: '1px solid var(--rule-heavy)', marginTop: 28 }}>
            <div>
              <div className="pricing-addon__name">One payment</div>
              <p className="pricing-addon__detail">
                Pro for a term, then the account returns to Free.
              </p>
            </div>
            <MonoMeta size="lg">$24.99</MonoMeta>
            <Button size="sm" disabled={Boolean(busy)} onClick={() => void checkout('semester_pass')}>
              {busy === 'semester_pass' ? 'Opening checkout…' : 'Get the pass'}
            </Button>
          </div>
        </div>

        <div className="pricing-page__actions">
          {billing?.subscription?.source === 'subscription' ? (
            <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void portal()}>
              {busy === 'portal' ? 'Opening…' : 'Manage subscription'}
            </Button>
          ) : null}
          {loggedIn ? (
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              Refresh balance
            </Button>
          ) : null}
        </div>

        {error ? (
          <div className="tv-banner-error" role="alert" style={{ marginTop: 16 }}>
            {error}
          </div>
        ) : null}
      </div>

      <SiteFooter onContact={onContact} onPitchMadness={onPitchMadness} onAdmin={onAdmin} />
    </div>
  );
}

export function openPricingPage(): void {
  navigate('/pricing');
}
