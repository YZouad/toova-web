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
import { formatUsd, TOPUP_OFFERS } from './planCatalog';

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
    <div className="toova-page pricing-page">
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

      <main className="toova-frame pricing-page__frame">
        <section className="pricing-hero">
          <div className="pricing-hero__copy">
            <Eyebrow level="page">Plans</Eyebrow>
            <DisplayHeading level={3}>A plan for every room.</DisplayHeading>
            <p className="pricing-hero__lede">
              Start free, upgrade when you need more rooms or cleaner exports, and add credits
              without changing your plan.
            </p>
            {billing ? (
              <div className="pricing-current">
                <MonoMeta size="sm" upper>Current account</MonoMeta>
                <span>{billing.display_name}</span>
                <span>{creditsTotal} credits available</span>
              </div>
            ) : null}
          </div>
          <aside className="pricing-hero__free" aria-label="Free plan includes">
            <MonoMeta size="sm" upper>Free, always</MonoMeta>
            <strong>$0</strong>
            <p>Build your first rooms before deciding whether you need more.</p>
            <dl>
              <div>
                <dt>Rooms</dt>
                <dd>5</dd>
              </div>
              <div>
                <dt>Credits / month</dt>
                <dd>15</dd>
              </div>
              <div>
                <dt>Commitment</dt>
                <dd>None</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className="pricing-section pricing-section--plans">
          <SectionOpener title="Choose your plan." note="Cancel or change anytime" />
          <PlanColumns context="pricing" loggedIn={loggedIn} onRequireAccount={onLogin} />
        </section>

        <section className="pricing-section">
          <SectionOpener title="Credit top-ups." note="Never expire · any plan" />
          <p className="pricing-section__intro">
            Need a few more photo-to-3D generations? Buy credits once and keep them until you use
            them.
          </p>
          <div className="pricing-topups">
            {TOPUP_OFFERS.map((topup) => (
              <article key={topup.kind} className="pricing-topup">
                <div className="pricing-topup__head">
                  <div className="pricing-addon__name">{topup.name}</div>
                  <span>{formatUsd(topup.cents)}</span>
                </div>
                <p className="pricing-addon__detail">{topup.detail}</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() => void checkout(topup.kind)}
                >
                  {busy === topup.kind ? 'Opening checkout…' : `Buy ${topup.name}`}
                </Button>
              </article>
            ))}
          </div>
        </section>

        <section className="pricing-section">
          <article className="semester-pass">
            <div className="semester-pass__copy">
              <MonoMeta size="sm" upper>Semester Pass</MonoMeta>
              <DisplayHeading level={4}>One term. Every Pro feature.</DisplayHeading>
              <p>
                Get <strong>5 months of Pro</strong> for one payment of <strong>$24.99 USD</strong>.
                There is no subscription and no automatic renewal. At the end of five months, your
                account simply returns to Free.
              </p>
              <ul aria-label="Semester Pass details">
                <li>5 months of Pro</li>
                <li>One payment</li>
                <li>No auto-renew</li>
              </ul>
            </div>
            <div className="semester-pass__purchase">
              <span className="semester-pass__price">$24.99</span>
              <MonoMeta size="sm">USD · one time</MonoMeta>
              <Button
                size="md"
                disabled={Boolean(busy)}
                onClick={() => void checkout('semester_pass')}
              >
                {busy === 'semester_pass' ? 'Opening checkout…' : 'Get the Semester Pass'}
              </Button>
            </div>
          </article>
        </section>

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
      </main>

      <SiteFooter onContact={onContact} onPitchMadness={onPitchMadness} onAdmin={onAdmin} />
    </div>
  );
}

export function openPricingPage(): void {
  navigate('/pricing');
}
