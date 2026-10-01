import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchMyBilling,
  type BillingSnapshot,
  type PlanEntitlements,
  totalCredits,
} from '../lib/billing';
import { useAuth } from './useAuth';

interface EntitlementsCtxValue {
  loading: boolean;
  billing: BillingSnapshot | null;
  entitlements: PlanEntitlements | null;
  creditsTotal: number;
  refresh: () => Promise<void>;
}

const EntitlementsContext = createContext<EntitlementsCtxValue | null>(null);

const DEFAULT_ENTITLEMENTS: PlanEntitlements = {
  tier: 'free',
  display_name: 'Free',
  max_rooms: 5,
  unlimited_rooms: false,
  monthly_credits: 15,
  export_max_px: 1920,
  watermark: true,
  ar_export: false,
  share_ttl_days: 14,
};

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setBilling(null);
      return;
    }
    setLoading(true);
    try {
      const snap = await fetchMyBilling();
      setBilling(snap);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      void refresh();
      params.delete('checkout');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState({}, '', next);
    }
  }, [refresh]);

  const entitlements = billing?.entitlements ?? (user ? DEFAULT_ENTITLEMENTS : null);

  const value = useMemo(
    () => ({
      loading,
      billing,
      entitlements,
      creditsTotal: totalCredits(billing),
      refresh,
    }),
    [loading, billing, entitlements, refresh],
  );

  return (
    <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>
  );
}

export function useEntitlements(): EntitlementsCtxValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    throw new Error('useEntitlements must be used within EntitlementsProvider');
  }
  return ctx;
}
