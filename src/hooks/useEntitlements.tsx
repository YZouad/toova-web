import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';

export type EntitlementFeatures = {
  max_rooms?: number | null;
  monthly_credits?: number | null;
  export_max_px?: number | null;
  export_watermark?: boolean;
  ar_usdz_export?: boolean;
  share_link_max_days?: number | null;
  [key: string]: number | boolean | null | undefined;
};

export type Entitlements = {
  user_id: string;
  plan_code: string;
  tier_rank: number;
  status: string;
  current_period_end: string | null;
  credits_available: number;
  credits_settled: number;
  features: EntitlementFeatures;
};

const FREE_FALLBACK: Entitlements = {
  user_id: '',
  plan_code: 'free',
  tier_rank: 0,
  status: 'none',
  current_period_end: null,
  credits_available: 0,
  credits_settled: 0,
  features: {
    max_rooms: 5,
    monthly_credits: 3,
    export_max_px: 1280,
    export_watermark: true,
    ar_usdz_export: false,
    share_link_max_days: 7,
  },
};

interface EntitlementsCtx {
  loading: boolean;
  entitlements: Entitlements;
  refresh: () => Promise<void>;
  maxRooms: number | null;
  isUnlimitedRooms: boolean;
  atRoomLimit: (roomCount: number) => boolean;
  overRoomLimit: (roomCount: number) => boolean;
}

const EntitlementsContext = createContext<EntitlementsCtx | null>(null);

function normalize(raw: unknown, userId: string): Entitlements {
  if (!raw || typeof raw !== 'object') {
    return { ...FREE_FALLBACK, user_id: userId };
  }
  const o = raw as Record<string, unknown>;
  const features =
    o.features && typeof o.features === 'object'
      ? (o.features as EntitlementFeatures)
      : FREE_FALLBACK.features;
  return {
    user_id: typeof o.user_id === 'string' ? o.user_id : userId,
    plan_code: typeof o.plan_code === 'string' ? o.plan_code : 'free',
    tier_rank: typeof o.tier_rank === 'number' ? o.tier_rank : 0,
    status: typeof o.status === 'string' ? o.status : 'none',
    current_period_end:
      typeof o.current_period_end === 'string' ? o.current_period_end : null,
    credits_available:
      typeof o.credits_available === 'number' ? o.credits_available : 0,
    credits_settled: typeof o.credits_settled === 'number' ? o.credits_settled : 0,
    features,
  };
}

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [entitlements, setEntitlements] = useState<Entitlements>(FREE_FALLBACK);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setEntitlements(FREE_FALLBACK);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_own_entitlements');
      if (error) throw error;
      setEntitlements(normalize(data, user.id));
    } catch (err) {
      console.warn('[entitlements] load failed', err);
      setEntitlements({ ...FREE_FALLBACK, user_id: user.id });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const maxRooms = useMemo(() => {
    const v = entitlements.features.max_rooms;
    if (v === null || v === undefined) return null;
    return typeof v === 'number' ? v : Number(v);
  }, [entitlements.features.max_rooms]);

  const isUnlimitedRooms = maxRooms == null || Number.isNaN(maxRooms);

  const value = useMemo<EntitlementsCtx>(
    () => ({
      loading,
      entitlements,
      refresh,
      maxRooms: isUnlimitedRooms ? null : maxRooms,
      isUnlimitedRooms,
      atRoomLimit: (roomCount: number) => {
        if (isUnlimitedRooms || maxRooms == null) return false;
        return roomCount >= maxRooms;
      },
      overRoomLimit: (roomCount: number) => {
        if (isUnlimitedRooms || maxRooms == null) return false;
        return roomCount > maxRooms;
      },
    }),
    [loading, entitlements, refresh, maxRooms, isUnlimitedRooms],
  );

  return (
    <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>
  );
}

export function useEntitlements(): EntitlementsCtx {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) throw new Error('useEntitlements must be used within EntitlementsProvider');
  return ctx;
}

export function featureFlag(
  entitlements: Entitlements,
  key: keyof EntitlementFeatures,
): boolean {
  return Boolean(entitlements.features[key]);
}

export function featureLimit(
  entitlements: Entitlements,
  key: keyof EntitlementFeatures,
): number | null {
  const v = entitlements.features[key];
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return null;
  return typeof v === 'number' ? v : Number(v);
}
