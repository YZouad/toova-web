import { supabase } from './supabase';

const rawBilling = import.meta.env.VITE_BILLING_API_URL;
const BILLING_BASE =
  typeof rawBilling === 'string' && rawBilling.trim() !== ''
    ? rawBilling.trim().replace(/\/$/, '')
    : import.meta.env.PROD
      ? 'https://toova-bff.onrender.com/api/billing'
      : '/api/billing';

async function billingAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in to manage billing.');
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    'content-type': 'application/json',
  };
}

export async function startPlanCheckout(opts: {
  planCode: string;
  interval: 'month' | 'year';
  student?: boolean;
}): Promise<string> {
  const res = await fetch(`${BILLING_BASE}/checkout`, {
    method: 'POST',
    headers: await billingAuthHeaders(),
    body: JSON.stringify(opts),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) {
    throw new Error(body.error || `Checkout failed (${res.status})`);
  }
  return body.url;
}

export async function startCreditsCheckout(priceId: string): Promise<string> {
  const res = await fetch(`${BILLING_BASE}/credits/checkout`, {
    method: 'POST',
    headers: await billingAuthHeaders(),
    body: JSON.stringify({ priceId }),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) {
    throw new Error(body.error || `Credit checkout failed (${res.status})`);
  }
  return body.url;
}

export async function openBillingPortal(returnUrl = `${window.location.origin}/billing`): Promise<string> {
  const res = await fetch(`${BILLING_BASE}/portal`, {
    method: 'POST',
    headers: await billingAuthHeaders(),
    body: JSON.stringify({ returnUrl }),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) {
    throw new Error(body.error || `Could not open billing portal (${res.status})`);
  }
  return body.url;
}

export type CatalogPlan = {
  code: string;
  display_name: string;
  tier_rank: number;
  monthly_credit_grant: number;
};

export type CatalogPrice = {
  id: string;
  plan_code: string | null;
  provider_price_id: string;
  interval: 'month' | 'year' | 'one_time';
  audience: 'public' | 'student';
  amount_cents: number;
  currency: string;
  credit_grant: number | null;
  is_purchasable: boolean;
};

export type CatalogEntitlement = {
  plan_code: string;
  feature_key: string;
  limit_value: number | null;
  flag_value: boolean | null;
};

export async function fetchBillingCatalog(): Promise<{
  plans: CatalogPlan[];
  prices: CatalogPrice[];
  entitlements: CatalogEntitlement[];
}> {
  const [plansRes, pricesRes, entsRes] = await Promise.all([
    supabase
      .from('billing_plans')
      .select('code, display_name, tier_rank, monthly_credit_grant')
      .is('retired_at', null)
      .order('tier_rank'),
    supabase
      .from('billing_prices')
      .select(
        'id, plan_code, provider_price_id, interval, audience, amount_cents, currency, credit_grant, is_purchasable',
      )
      .is('retired_at', null),
    supabase.from('plan_entitlements').select('plan_code, feature_key, limit_value, flag_value'),
  ]);

  return {
    plans: (plansRes.data ?? []) as CatalogPlan[],
    prices: (pricesRes.data ?? []) as CatalogPrice[],
    entitlements: (entsRes.data ?? []) as CatalogEntitlement[],
  };
}
