import { useCallback, useEffect, useState } from 'react';
import {
  adminContentReportAction,
  adminListContentReports,
  adminUnreviewedReportCount,
  signReportEvidence,
  type AdminReportAction,
  type ContentReportRow,
} from '../lib/contentReports';

export interface UseContentReportsResult {
  reports: ContentReportRow[];
  total: number;
  unreviewed: number;
  loading: boolean;
  error: string | null;
  statusFilter: string | null;
  reasonFilter: string | null;
  setStatusFilter: (v: string | null) => void;
  setReasonFilter: (v: string | null) => void;
  refetch: () => Promise<void>;
  act: (opts: {
    reportId: string;
    action: AdminReportAction;
    note?: string | null;
    ncmecReportId?: string | null;
  }) => Promise<void>;
  loadEvidence: (reportId: string) => Promise<{
    urls: Record<string, string | null>;
    evidence: Record<string, unknown>;
  }>;
}

export function useContentReports(enabled: boolean): UseContentReportsResult {
  const [reports, setReports] = useState<ContentReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [unreviewed, setUnreviewed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>('new');
  const [reasonFilter, setReasonFilter] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setReports([]);
      setTotal(0);
      setUnreviewed(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [list, count] = await Promise.all([
        adminListContentReports({
          status: statusFilter === 'all' ? null : statusFilter,
          reason: reasonFilter,
          limit: 100,
        }),
        adminUnreviewedReportCount(),
      ]);
      setReports(list.reports);
      setTotal(list.total);
      setUnreviewed(count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load reports');
    } finally {
      setLoading(false);
    }
  }, [enabled, statusFilter, reasonFilter]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const act = useCallback(
    async (opts: {
      reportId: string;
      action: AdminReportAction;
      note?: string | null;
      ncmecReportId?: string | null;
    }) => {
      await adminContentReportAction(opts);
      await refetch();
    },
    [refetch],
  );

  const loadEvidence = useCallback(async (reportId: string) => {
    return signReportEvidence(reportId);
  }, []);

  return {
    reports,
    total,
    unreviewed,
    loading,
    error,
    statusFilter,
    reasonFilter,
    setStatusFilter,
    setReasonFilter,
    refetch,
    act,
    loadEvidence,
  };
}
