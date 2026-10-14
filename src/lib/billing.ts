import { requireAccessToken } from './authAccessToken';
import {
  checkoutReturnUrls,
  clearCheckoutReturn,
  rememberCheckoutReturn,
} from './checkoutReturn';
import { supabase } from './supabase';

export type PlanTier = 'free' | 'lite' | 'pro';

export interface PlanEntitlements {
  tier: PlanTier;
  display_name: string;
  max_rooms: number | null;
  unlimited_rooms: boolean;
  monthly_credits: number;
  export_max_px: number;
  watermark: boolean;
  ar_export: boolean;
  share_ttl_days: number | null;
}

export interface BillingSnapshot {
  tier: PlanTier;
  display_name: string;
  entitlements: PlanEntitlements;
  monthly_balance: number;
  purchased_balance: number;
  /** Credits owed after a refund clawback when spendable purchased balance was insufficient. */
  purchased_debt: number;
  monthly_period_end: string | null;
  subscription: {
    status: string;
    source: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
}

export type CheckoutKind =
  | 'lite_monthly'
  | 'lite_yearly'
  | 'pro_monthly'
  | 'pro_yearly'
  | 'topup_50'
  | 'topup_150'
  | 'topup_400'
  | 'semester_pass';

export function totalCredits(billing: BillingSnapshot | null): number {
  if (!billing) return 0;
  return billing.monthly_balance + billing.purchased_balance;
}

export function purchasedDebt(billing: BillingSnapshot | null): number {
  if (!billing) return 0;
  return Math.max(0, billing.purchased_debt ?? 0);
}

export async function fetchMyBilling(): Promise<BillingSnapshot | null> {
  const { data, error } = await supabase.rpc('get_my_billing');
  if (error) {
    console.error('get_my_billing', error.message);
    return null;
  }
  return data as BillingSnapshot;
}

export async function startCheckout(
  kind: CheckoutKind,
  urls?: { successUrl?: string; cancelUrl?: string },
): Promise<string> {
  const defaults = typeof window !== 'undefined'
    ? checkoutReturnUrls(window.location.href)
    : undefined;
  rememberCheckoutReturn();
  try {
    const accessToken = await requireAccessToken('Sign in to purchase credits.');
    const { data, error } = await supabase.functions.invoke('billing-checkout', {
      body: {
        kind,
        success_url: urls?.successUrl ?? defaults?.successUrl,
        cancel_url: urls?.cancelUrl ?? defaults?.cancelUrl,
      },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (error) throw new Error(error.message);
    const url = (data as { url?: string })?.url;
    if (!url) {
      const message = (data as { message?: string })?.message;
      throw new Error(message || 'Checkout is not available yet.');
    }
    return url;
  } catch (err) {
    clearCheckoutReturn();
    throw err;
  }
}

export async function openBillingPortal(returnUrl?: string): Promise<string> {
  const accessToken = await requireAccessToken('Sign in to manage billing.');
  const { data, error } = await supabase.functions.invoke('billing-portal', {
    body: { return_url: returnUrl },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) throw new Error(error.message);
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error('Could not open billing portal.');
  return url;
}

export async function invokeExportUsdz(input: {
  catalog_kind: string;
  glb_path: string;
}): Promise<{ usdz_path: string }> {
  const { data, error } = await supabase.functions.invoke('export-usdz', {
    body: input,
  });
  if (error) throw new Error(error.message);
  const path = (data as { usdz_path?: string })?.usdz_path;
  if (!path) {
    const err = (data as { error?: string })?.error;
    throw new Error(err || 'USDZ export failed.');
  }
  return { usdz_path: path };
}
