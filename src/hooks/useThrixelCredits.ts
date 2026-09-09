import { useCallback, useEffect, useState } from 'react';
import { fetchThrixelAccount, fetchThrixelConnectionStatus, fetchThrixelPricing } from '../lib/thrixelApi';
import {
  formatCostLine,
  formatCubeBalance,
  parseThrixelAccount,
  parseThrixelPricing,
  type ThrixelAccountInfo,
  type ThrixelCostKind,
  type ThrixelPricingInfo,
} from '../lib/thrixelCosts';

function friendlyPricingError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('404') || lower.includes('not found')) {
    return 'Thrixel pricing unavailable — deploy latest BFF.';
  }
  return message;
}

function friendlyAccountError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('404') || lower.includes('not found')) {
    return 'Thrixel balance unavailable — deploy latest BFF.';
  }
  return message;
}

export function useThrixelCredits(enabled = true) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [account, setAccount] = useState<ThrixelAccountInfo | null>(null);
  const [pricing, setPricing] = useState<ThrixelPricingInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    setPricingError(null);
    setAccountError(null);

    let nextPricing: ThrixelPricingInfo | null = null;
    let nextAccount: ThrixelAccountInfo | null = null;
    let nextConnected: boolean | null = null;
    let nextPricingError: string | null = null;
    let nextAccountError: string | null = null;

    try {
      const pricingRaw = await fetchThrixelPricing();
      nextPricing = parseThrixelPricing(pricingRaw);
    } catch (err) {
      nextPricingError = friendlyPricingError(
        err instanceof Error ? err.message : 'Could not load Thrixel pricing.',
      );
    }

    try {
      const connection = await fetchThrixelConnectionStatus();
      nextConnected = connection.connected;
      if (connection.connected) {
        try {
          const accountRaw = await fetchThrixelAccount();
          nextAccount = parseThrixelAccount(accountRaw);
        } catch (err) {
          nextAccountError = friendlyAccountError(
            err instanceof Error ? err.message : 'Could not load Thrixel balance.',
          );
        }
      }
    } catch (err) {
      nextConnected = false;
      nextAccountError =
        err instanceof Error ? err.message : 'Could not load Thrixel connection.';
    }

    setPricing(nextPricing);
    setAccount(nextAccount);
    setConnected(nextConnected);
    setPricingError(nextPricingError);
    setAccountError(nextAccountError);

    if (nextPricingError && !nextPricing) {
      setError(nextPricingError);
    } else if (nextAccountError) {
      setError(nextAccountError);
    }

    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const balanceLabel = formatCubeBalance(account);

  const costLine = useCallback(
    (kind: ThrixelCostKind, opts?: { hasPrompt?: boolean }) =>
      formatCostLine(account, kind, pricing, opts),
    [account, pricing],
  );

  const pricingOnlyCostLine = useCallback(
    (kind: ThrixelCostKind, opts?: { hasPrompt?: boolean }) =>
      formatCostLine(null, kind, pricing, opts),
    [pricing],
  );

  return {
    connected,
    account,
    pricing,
    loading,
    error,
    pricingError,
    accountError,
    balanceLabel,
    costLine,
    pricingOnlyCostLine,
    refresh,
  };
}
