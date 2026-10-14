import type { CheckoutKind } from '../../lib/billing';

/** Display prices. Yearly amounts match the Stripe prices. */
export type BillingInterval = 'monthly' | 'yearly';

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface PlanOffer {
  tier: 'lite' | 'pro';
  name: string;
  blurb: string;
  monthlyCents: number;
  yearlyCents: number;
  checkout: Record<BillingInterval, CheckoutKind>;
  /** What this plan includes. Quantities are the plan’s own, not the other plan’s. */
  features: PlanFeature[];
}

export const PLAN_OFFERS: PlanOffer[] = [
  {
    tier: 'lite',
    name: 'Lite',
    blurb: 'Fifteen rooms and a monthly credit bump, without a watermark.',
    monthlyCents: 299,
    yearlyCents: 2999,
    checkout: { monthly: 'lite_monthly', yearly: 'lite_yearly' },
    features: [
      { label: '15 rooms', included: true },
      { label: '60 credits a month', included: true },
      { label: 'Watermark-free exports', included: true },
      { label: 'Share links for 90 days', included: true },
      { label: '4K exports', included: false },
      { label: 'AR and USDZ export', included: false },
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    blurb: 'Unlimited rooms, 4K exports, AR, and links that stay up.',
    monthlyCents: 799,
    yearlyCents: 5900,
    checkout: { monthly: 'pro_monthly', yearly: 'pro_yearly' },
    features: [
      { label: 'Unlimited rooms', included: true },
      { label: '250 credits a month', included: true },
      { label: 'Watermark-free exports', included: true },
      { label: 'Share links that do not expire', included: true },
      { label: '4K exports', included: true },
      { label: 'AR and USDZ export', included: true },
    ],
  },
];

export interface TopupOffer {
  kind: CheckoutKind;
  name: string;
  cents: number;
  detail: string;
}

/** One-time credit packs. Purchased credits do not expire. */
export const TOPUP_OFFERS: TopupOffer[] = [
  { kind: 'topup_50', name: '50 credits', cents: 399, detail: 'A few extra photo-to-3D runs' },
  { kind: 'topup_150', name: '150 credits', cents: 999, detail: 'A busy week of imports' },
  { kind: 'topup_400', name: '400 credits', cents: 1999, detail: 'A full move-in of new pieces' },
];

export function formatUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}$${dollars}.${rem.toString().padStart(2, '0')}`;
}

export function yearlyMonthlyCents(plan: PlanOffer): number {
  return Math.round(plan.yearlyCents / 12);
}

export function yearlySavingsCents(plan: PlanOffer): number {
  return plan.monthlyCents * 12 - plan.yearlyCents;
}

/** Share of twelve monthly bills that the yearly price removes. */
export function yearlySavingsPercent(plan: PlanOffer): number {
  return Math.round((yearlySavingsCents(plan) / (plan.monthlyCents * 12)) * 100);
}
