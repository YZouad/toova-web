import { useEffect, useState } from 'react';
import { startCheckout, type CheckoutKind } from '../../lib/billing';
import { trackPaywallShown, trackCheckoutStarted } from '../../lib/analytics';
import { Button } from '../kit/Button';
import { Modal } from '../kit/Modal';

export type PaywallReason = 'credits' | 'rooms' | 'export' | 'share' | 'ar' | 'generic';

interface UpgradeModalProps {
  open: boolean;
  reason: PaywallReason;
  onClose: () => void;
  onViewPricing?: () => void;
}

const COPY: Record<PaywallReason, { title: string; body: string }> = {
  credits: {
    title: 'You need more credits.',
    body: 'Upgrade your plan or buy a credit pack to keep generating 3D models from photos.',
  },
  rooms: {
    title: 'Room limit reached.',
    body: 'Lite and Pro plans include more rooms so you can design every space you need.',
  },
  export: {
    title: 'Unlock full-res exports.',
    body: 'Pro removes the watermark and unlocks 4K exports for portfolios and move-in posts.',
  },
  share: {
    title: 'Keep share links alive.',
    body: 'Pro share links never expire — great for roommates, family, and social posts.',
  },
  ar: {
    title: 'AR export is a Pro feature.',
    body: 'Export USDZ files for Quick Look and place models in your real room.',
  },
  generic: {
    title: 'Upgrade Toova.',
    body: 'Pick Lite for everyday dorm design or Pro for unlimited rooms and premium exports.',
  },
};

export function UpgradeModal({ open, reason, onClose, onViewPricing }: UpgradeModalProps) {
  const [busy, setBusy] = useState<CheckoutKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[reason];

  useEffect(() => {
    if (open) trackPaywallShown({ reason });
  }, [open, reason]);

  if (!open) return null;

  async function checkout(kind: CheckoutKind) {
    setBusy(kind);
    setError(null);
    trackCheckoutStarted({ kind, context: reason });
    try {
      const url = await startCheckout(kind);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      meta="Upgrade"
      title={copy.title}
      onClose={onClose}
      width={440}
      footer={
        <>
          <Button size="sm" variant="outline" onClick={onClose} disabled={Boolean(busy)}>
            Not now
          </Button>
          {onViewPricing ? (
            <Button size="sm" variant="outline" onClick={onViewPricing} disabled={Boolean(busy)}>
              Compare plans
            </Button>
          ) : null}
        </>
      }
    >
      <p style={{ margin: '0 0 16px', lineHeight: 1.5 }}>{copy.body}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button size="sm" onClick={() => void checkout('lite_monthly')} disabled={Boolean(busy)}>
          {busy === 'lite_monthly' ? 'Opening checkout…' : 'Lite — $2.99/mo'}
        </Button>
        <Button size="sm" onClick={() => void checkout('pro_monthly')} disabled={Boolean(busy)}>
          {busy === 'pro_monthly' ? 'Opening checkout…' : 'Pro — $7.99/mo'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void checkout('topup_50')} disabled={Boolean(busy)}>
          {busy === 'topup_50' ? 'Opening checkout…' : 'Buy 50 credits — $3.99'}
        </Button>
      </div>
      {error ? (
        <div className="tv-banner-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}
    </Modal>
  );
}
