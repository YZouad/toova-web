import { supabase } from './supabase';

export type AnalyticsPreset = '24h' | '7d' | '30d' | '90d' | 'all' | 'custom';
export type AnalyticsScope = 'all' | 'consented' | 'operational';
export type AnalyticsUserType = 'all' | 'new' | 'returning';

export interface AnalyticsFilters {
  scope: AnalyticsScope;
  user_type: AnalyticsUserType;
  auth_method: string;
  device: string;
  context: string;
}

export interface AnalyticsKpi {
  key: string;
  label: string;
  value: number;
  previous: number;
  delta_pct: number | null;
  scope: string;
  unavailable?: boolean;
}

export interface AnalyticsSeries {
  key: string;
  label: string;
  unit?: string;
  points: Array<{ t: string; v: number }>;
}

export interface AnalyticsFunnelStep {
  key: string;
  label: string;
  value: number;
  unavailable?: boolean;
}

export interface AnalyticsCohortRow {
  cohort: string;
  size: number;
  d1: number;
  d7: number;
  d30: number;
}

export interface AnalyticsBreakdownRow {
  key: string;
  label: string;
  value: number;
}

export interface AnalyticsEventRow {
  id: string;
  occurred_at: string;
  name: string;
  user_id: string | null;
  handle: string | null;
  display_name: string | null;
  session_id: string | null;
  route: string | null;
  device: string | null;
  source: string | null;
  consent_scope: string | null;
  properties: Record<string, unknown>;
}

export interface AdminAnalyticsDashboard {
  generated_at: string;
  range: { from: string; to: string };
  previous_range: { from: string; to: string };
  events_since: string | null;
  kpis: AnalyticsKpi[];
  timeseries: Record<string, AnalyticsSeries>;
  stickiness: {
    dau: number;
    wau: number;
    mau: number;
    dau_wau: number | null;
    dau_mau: number | null;
  };
  funnels: {
    activation: AnalyticsFunnelStep[];
    commerce: AnalyticsFunnelStep[];
  };
  cohorts: AnalyticsCohortRow[];
  breakdowns: Record<string, AnalyticsBreakdownRow[]>;
  reliability: {
    started: number;
    succeeded: number;
    failed: number;
    success_rate: number | null;
    p50_ms: number | null;
    p95_ms: number | null;
    failure_reasons: AnalyticsBreakdownRow[];
  };
  search: { total: number; zero_results: number };
  community: {
    public_rooms: number;
    private_rooms: number;
    public_models: number;
    reports: number;
  };
  explorer: { total: number; events: AnalyticsEventRow[] };
  health: {
    ingested_24h: number;
    last_event_at: string | null;
    backfill_rows: number;
  };
}

export interface AdminUserAnalyticsExtras {
  range?: { from: string; to: string };
  totals?: Record<string, number>;
  funnel?: Array<{ key: string; label: string; at: string | null }>;
  breakdowns?: Record<string, AnalyticsBreakdownRow[]>;
  recent_events?: AnalyticsEventRow[];
}

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsFilters = {
  scope: 'all',
  user_type: 'all',
  auth_method: '',
  device: '',
  context: '',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNum(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asNumOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value;
  return null;
}

function parseKpi(raw: unknown): AnalyticsKpi | null {
  const row = asRecord(raw);
  if (!row || !asString(row.key)) return null;
  return {
    key: String(row.key),
    label: asString(row.label) ?? String(row.key),
    value: asNum(row.value),
    previous: asNum(row.previous),
    delta_pct: asNumOrNull(row.delta_pct),
    scope: asString(row.scope) ?? 'mixed',
    unavailable: row.unavailable === true,
  };
}

function parseSeries(raw: unknown): AnalyticsSeries | null {
  const row = asRecord(raw);
  if (!row) return null;
  const points = Array.isArray(row.points)
    ? row.points
        .map((p) => {
          const pt = asRecord(p);
          if (!pt) return null;
          const t = pt.t;
          return { t: t == null ? '' : String(t), v: asNum(pt.v) };
        })
        .filter((p): p is { t: string; v: number } => p != null)
    : [];
  return {
    key: asString(row.key) ?? 'series',
    label: asString(row.label) ?? 'Series',
    unit: asString(row.unit) ?? undefined,
    points,
  };
}

function parseFunnel(raw: unknown): AnalyticsFunnelStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: AnalyticsFunnelStep[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row || !asString(row.key)) continue;
    steps.push({
      key: String(row.key),
      label: asString(row.label) ?? String(row.key),
      value: asNum(row.value),
      unavailable: row.unavailable === true,
    });
  }
  return steps;
}

function parseCohorts(raw: unknown): AnalyticsCohortRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      return {
        cohort: String(row.cohort ?? ''),
        size: asNum(row.size),
        d1: asNum(row.d1),
        d7: asNum(row.d7),
        d30: asNum(row.d30),
      };
    })
    .filter((r): r is AnalyticsCohortRow => Boolean(r?.cohort));
}

function parseBreakdowns(raw: unknown): Record<string, AnalyticsBreakdownRow[]> {
  const row = asRecord(raw);
  if (!row) return {};
  const out: Record<string, AnalyticsBreakdownRow[]> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!Array.isArray(value)) continue;
    out[key] = value
      .map((item) => {
        const r = asRecord(item);
        if (!r) return null;
        return {
          key: String(r.key ?? r.label ?? ''),
          label: String(r.label ?? r.key ?? ''),
          value: asNum(r.value),
        };
      })
      .filter((r): r is AnalyticsBreakdownRow => Boolean(r?.key));
  }
  return out;
}

function parseEvent(raw: unknown): AnalyticsEventRow | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = asString(row.id);
  const name = asString(row.name);
  const occurred = asIso(row.occurred_at);
  if (!id || !name || !occurred) return null;
  return {
    id,
    occurred_at: occurred,
    name,
    user_id: asString(row.user_id),
    handle: asString(row.handle),
    display_name: asString(row.display_name),
    session_id: asString(row.session_id),
    route: asString(row.route),
    device: asString(row.device),
    source: asString(row.source),
    consent_scope: asString(row.consent_scope),
    properties: asRecord(row.properties) ?? {},
  };
}

export function parseAdminAnalyticsDashboard(raw: unknown): AdminAnalyticsDashboard | null {
  const row = asRecord(raw);
  if (!row) return null;
  const range = asRecord(row.range);
  const prev = asRecord(row.previous_range);
  const stick = asRecord(row.stickiness) ?? {};
  const funnels = asRecord(row.funnels) ?? {};
  const reliability = asRecord(row.reliability) ?? {};
  const search = asRecord(row.search) ?? {};
  const community = asRecord(row.community) ?? {};
  const explorer = asRecord(row.explorer) ?? {};
  const health = asRecord(row.health) ?? {};
  const timeseriesRaw = asRecord(row.timeseries) ?? {};
  const timeseries: Record<string, AnalyticsSeries> = {};
  for (const [key, value] of Object.entries(timeseriesRaw)) {
    const series = parseSeries(value);
    if (series) timeseries[key] = series;
  }
  return {
    generated_at: asIso(row.generated_at) ?? new Date().toISOString(),
    range: {
      from: asIso(range?.from) ?? new Date(Date.now() - 30 * 86400000).toISOString(),
      to: asIso(range?.to) ?? new Date().toISOString(),
    },
    previous_range: {
      from: asIso(prev?.from) ?? new Date(Date.now() - 60 * 86400000).toISOString(),
      to: asIso(prev?.to) ?? new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    events_since: asIso(row.events_since),
    kpis: Array.isArray(row.kpis) ? row.kpis.map(parseKpi).filter((k): k is AnalyticsKpi => k != null) : [],
    timeseries,
    stickiness: {
      dau: asNum(stick.dau),
      wau: asNum(stick.wau),
      mau: asNum(stick.mau),
      dau_wau: asNumOrNull(stick.dau_wau),
      dau_mau: asNumOrNull(stick.dau_mau),
    },
    funnels: {
      activation: parseFunnel(funnels.activation),
      commerce: parseFunnel(funnels.commerce),
    },
    cohorts: parseCohorts(row.cohorts),
    breakdowns: parseBreakdowns(row.breakdowns),
    reliability: {
      started: asNum(reliability.started),
      succeeded: asNum(reliability.succeeded),
      failed: asNum(reliability.failed),
      success_rate: asNumOrNull(reliability.success_rate),
      p50_ms: asNumOrNull(reliability.p50_ms),
      p95_ms: asNumOrNull(reliability.p95_ms),
      failure_reasons: parseBreakdowns({ r: reliability.failure_reasons }).r ?? [],
    },
    search: {
      total: asNum(search.total),
      zero_results: asNum(search.zero_results),
    },
    community: {
      public_rooms: asNum(community.public_rooms),
      private_rooms: asNum(community.private_rooms),
      public_models: asNum(community.public_models),
      reports: asNum(community.reports),
    },
    explorer: {
      total: asNum(explorer.total),
      events: Array.isArray(explorer.events)
        ? explorer.events.map(parseEvent).filter((e): e is AnalyticsEventRow => e != null)
        : [],
    },
    health: {
      ingested_24h: asNum(health.ingested_24h),
      last_event_at: asIso(health.last_event_at),
      backfill_rows: asNum(health.backfill_rows),
    },
  };
}

export function parseAdminUserAnalyticsExtras(raw: unknown): AdminUserAnalyticsExtras {
  const row = asRecord(raw);
  if (!row) return {};
  return {
    range: asRecord(row.range)
      ? { from: String(asRecord(row.range)?.from ?? ''), to: String(asRecord(row.range)?.to ?? '') }
      : undefined,
    totals: asRecord(row.totals)
      ? Object.fromEntries(Object.entries(asRecord(row.totals)!).map(([k, v]) => [k, asNum(v)]))
      : undefined,
    funnel: Array.isArray(row.funnel)
      ? row.funnel
          .map((item) => {
            const r = asRecord(item);
            if (!r) return null;
            return { key: String(r.key ?? ''), label: String(r.label ?? r.key ?? ''), at: asIso(r.at) };
          })
          .filter((s): s is { key: string; label: string; at: string | null } => Boolean(s?.key))
      : undefined,
    breakdowns: parseBreakdowns(row.breakdowns),
    recent_events: Array.isArray(row.recent_events)
      ? row.recent_events.map(parseEvent).filter((e): e is AnalyticsEventRow => e != null)
      : undefined,
  };
}

export function resolveAnalyticsRange(
  preset: AnalyticsPreset,
  now = new Date(),
  customFrom?: string,
  customTo?: string,
  eventsSince?: string | null,
): { from: Date; to: Date } {
  const to = new Date(now);
  if (preset === 'custom' && customFrom && customTo) {
    const from = new Date(customFrom);
    const end = new Date(customTo);
    if (Number.isFinite(from.getTime()) && Number.isFinite(end.getTime()) && from < end) {
      return { from, to: end };
    }
  }
  const ms = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  } as const;
  if (preset === 'all') {
    const from = eventsSince ? new Date(eventsSince) : new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000);
    return { from: Number.isFinite(from.getTime()) ? from : new Date(to.getTime() - 365 * 86400000), to };
  }
  if (preset === 'custom') {
    return { from: new Date(to.getTime() - ms['30d']), to };
  }
  return { from: new Date(to.getTime() - ms[preset]), to };
}

export async function fetchAdminAnalytics(
  from: Date,
  to: Date,
  filters: AnalyticsFilters,
): Promise<AdminAnalyticsDashboard> {
  const { data, error } = await supabase.rpc('get_admin_analytics', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_filters: {
      scope: filters.scope,
      user_type: filters.user_type,
      auth_method: filters.auth_method || undefined,
      device: filters.device || undefined,
    },
  });
  if (error) throw new Error(error.message);
  const parsed = parseAdminAnalyticsDashboard(data);
  if (!parsed) throw new Error('Invalid analytics payload');
  return parsed;
}

export async function fetchAdminAnalyticsEvents(input: {
  from: Date;
  to: Date;
  name?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; events: AnalyticsEventRow[] }> {
  const { data, error } = await supabase.rpc('get_admin_analytics_events', {
    p_from: input.from.toISOString(),
    p_to: input.to.toISOString(),
    p_name: input.name ?? null,
    p_user_id: input.userId ?? null,
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const row = asRecord(data);
  return {
    total: asNum(row?.total),
    events: Array.isArray(row?.events)
      ? row.events.map(parseEvent).filter((e): e is AnalyticsEventRow => e != null)
      : [],
  };
}
