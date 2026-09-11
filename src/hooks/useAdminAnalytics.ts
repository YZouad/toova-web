import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_ANALYTICS_FILTERS,
  fetchAdminAnalytics,
  resolveAnalyticsRange,
  type AdminAnalyticsDashboard,
  type AnalyticsFilters,
  type AnalyticsPreset,
} from '../lib/adminAnalytics';

export function useAdminAnalytics(enabled: boolean) {
  const [preset, setPreset] = useState<AnalyticsPreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filters, setFilters] = useState<AnalyticsFilters>(DEFAULT_ANALYTICS_FILTERS);
  const [data, setData] = useState<AdminAnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const range = resolveAnalyticsRange(
        preset,
        new Date(),
        customFrom,
        customTo,
        data?.events_since,
      );
      const next = await fetchAdminAnalytics(range.from, range.to, filters);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [enabled, preset, customFrom, customTo, filters, data?.events_since]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    // Intentionally omit `load` identity churn from events_since after first fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, preset, customFrom, customTo, filters]);

  return {
    preset,
    setPreset,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    filters,
    setFilters,
    data,
    loading,
    error,
    refetch: load,
  };
}
