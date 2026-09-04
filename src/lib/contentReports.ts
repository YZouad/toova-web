import { supabase } from './supabase';

export type ContentReportTargetType =
  | 'catalog_model'
  | 'room'
  | 'profile'
  | 'avatar'
  | 'share'
  | 'other';

export type ContentReportReason =
  | 'csam'
  | 'sexual_content'
  | 'harassment'
  | 'inappropriate'
  | 'spam'
  | 'stolen'
  | 'other';

export type ContentReportStatus =
  | 'new'
  | 'reviewing'
  | 'actioned'
  | 'dismissed'
  | 'escalated_ncmec';

export const REPORT_REASON_OPTIONS: { value: ContentReportReason; label: string }[] = [
  { value: 'csam', label: 'Child sexual abuse material' },
  { value: 'sexual_content', label: 'Sexual content' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'spam', label: 'Spam' },
  { value: 'stolen', label: 'Stolen / IP' },
  { value: 'other', label: 'Other' },
];

const REPORTED_SESSION_KEY = 'toova-content-reported';

function reportKey(type: ContentReportTargetType, id: string): string {
  return `${type}:${id}`;
}

export function hasReportedTarget(type: ContentReportTargetType, id: string): boolean {
  try {
    const raw = sessionStorage.getItem(REPORTED_SESSION_KEY);
    if (!raw) return false;
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) && arr.map(String).includes(reportKey(type, id));
  } catch {
    return false;
  }
}

function markReportedTarget(type: ContentReportTargetType, id: string): void {
  try {
    const raw = sessionStorage.getItem(REPORTED_SESSION_KEY);
    const prev = raw ? (JSON.parse(raw) as unknown) : [];
    const set = new Set(Array.isArray(prev) ? prev.map(String) : []);
    set.add(reportKey(type, id));
    sessionStorage.setItem(REPORTED_SESSION_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export interface SubmitContentReportInput {
  targetType: ContentReportTargetType;
  targetId: string;
  reason: ContentReportReason;
  details?: string | null;
  reporterEmail?: string | null;
}

export async function submitContentReport(
  input: SubmitContentReportInput,
): Promise<{ id: string; quarantined: boolean }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke('report-content', {
    body: {
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason,
      details: input.details?.trim() || null,
      reporter_email: input.reporterEmail?.trim() || null,
    },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (error) throw new Error(error.message);
  const payload = data as { ok?: boolean; id?: string; quarantined?: boolean; error?: string } | null;
  if (!payload?.ok || !payload.id) {
    throw new Error(payload?.error || 'Could not send report');
  }
  markReportedTarget(input.targetType, input.targetId);
  return { id: payload.id, quarantined: Boolean(payload.quarantined) };
}

export interface ContentReportRow {
  id: string;
  created_at: string;
  reporter_id: string | null;
  reporter_email: string | null;
  target_type: ContentReportTargetType;
  target_id: string;
  target_owner_id: string | null;
  reason: ContentReportReason;
  details: string | null;
  status: ContentReportStatus;
  evidence: Record<string, unknown>;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  ncmec_report_id: string | null;
  ncmec_reported_at: string | null;
  preserve_until: string | null;
}

export async function adminListContentReports(opts?: {
  status?: string | null;
  reason?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; reports: ContentReportRow[] }> {
  const { data, error } = await supabase.rpc('admin_list_content_reports', {
    p_status: opts?.status ?? null,
    p_reason: opts?.reason ?? null,
    p_limit: opts?.limit ?? 50,
    p_offset: opts?.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const row = data as { total?: number; reports?: ContentReportRow[] } | null;
  return {
    total: Number(row?.total ?? 0),
    reports: Array.isArray(row?.reports) ? row.reports : [],
  };
}

export async function adminUnreviewedReportCount(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_unreviewed_report_count');
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export type AdminReportAction =
  | 'reviewing'
  | 'quarantine'
  | 'restore'
  | 'dismiss'
  | 'action'
  | 'ban_uploader'
  | 'escalate_ncmec';

export async function adminContentReportAction(opts: {
  reportId: string;
  action: AdminReportAction;
  note?: string | null;
  ncmecReportId?: string | null;
}): Promise<ContentReportRow> {
  const { data, error } = await supabase.rpc('admin_content_report_action', {
    p_report_id: opts.reportId,
    p_action: opts.action,
    p_note: opts.note ?? null,
    p_ncmec_report_id: opts.ncmecReportId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as ContentReportRow;
}

export async function signReportEvidence(reportId: string): Promise<{
  urls: Record<string, string | null>;
  evidence: Record<string, unknown>;
}> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('sign-report-evidence', {
    body: { report_id: reportId },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw new Error(error.message);
  const payload = data as {
    ok?: boolean;
    urls?: Record<string, string | null>;
    evidence?: Record<string, unknown>;
    error?: string;
  } | null;
  if (!payload?.ok) throw new Error(payload?.error || 'Could not sign evidence');
  return {
    urls: payload.urls ?? {},
    evidence: payload.evidence ?? {},
  };
}
