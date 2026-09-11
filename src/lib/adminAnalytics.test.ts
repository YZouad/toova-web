import { describe, expect, it } from 'vitest';
import {
  parseAdminAnalyticsDashboard,
  resolveAnalyticsRange,
} from './adminAnalytics';

const sample = {
  generated_at: '2026-09-10T12:00:00.000Z',
  range: { from: '2026-08-11T12:00:00.000Z', to: '2026-09-10T12:00:00.000Z' },
  previous_range: { from: '2026-07-12T12:00:00.000Z', to: '2026-08-11T12:00:00.000Z' },
  events_since: '2026-09-10T00:00:00.000Z',
  kpis: [
    { key: 'sessions', label: 'Sessions', value: 10, previous: 5, delta_pct: 100, scope: 'consented' },
  ],
  timeseries: {
    sessions: { key: 'sessions', label: 'Sessions', unit: 'sessions', points: [{ t: '2026-09-09', v: 3 }] },
  },
  stickiness: { dau: 2, wau: 4, mau: 8, dau_wau: 50, dau_mau: 25 },
  funnels: { activation: [{ key: 'signup', label: 'Signups', value: 2 }], commerce: [] },
  cohorts: [{ cohort: '2026-09-07', size: 4, d1: 1, d7: 2, d30: 3 }],
  breakdowns: { device: [{ key: 'desktop', label: 'desktop', value: 9 }] },
  reliability: {
    started: 4,
    succeeded: 3,
    failed: 1,
    success_rate: 75,
    p50_ms: 1200,
    p95_ms: 4000,
    failure_reasons: [{ key: 'unknown', label: 'unknown', value: 1 }],
  },
  search: { total: 8, zero_results: 1 },
  community: { public_rooms: 2, private_rooms: 5, public_models: 1, reports: 0 },
  explorer: {
    total: 1,
    events: [
      {
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        occurred_at: '2026-09-10T11:00:00.000Z',
        name: 'page_view',
        user_id: null,
        handle: null,
        display_name: null,
        session_id: 's1',
        route: '/',
        device: 'desktop',
        source: 'client',
        consent_scope: 'consented',
        properties: {},
      },
    ],
  },
  health: { ingested_24h: 1, last_event_at: '2026-09-10T11:00:00.000Z', backfill_rows: 12 },
};

describe('parseAdminAnalyticsDashboard', () => {
  it('parses KPIs, series, funnels, and explorer rows', () => {
    const parsed = parseAdminAnalyticsDashboard(sample);
    expect(parsed?.kpis[0]?.delta_pct).toBe(100);
    expect(parsed?.timeseries.sessions.points[0]?.v).toBe(3);
    expect(parsed?.funnels.activation[0]?.key).toBe('signup');
    expect(parsed?.explorer.events[0]?.name).toBe('page_view');
    expect(parsed?.reliability.success_rate).toBe(75);
  });

  it('returns null for garbage payloads', () => {
    expect(parseAdminAnalyticsDashboard('nope')).toBeNull();
  });
});

describe('resolveAnalyticsRange', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');

  it('maps presets to previous-period comparable windows', () => {
    const day = resolveAnalyticsRange('24h', now);
    expect(day.to.toISOString()).toBe(now.toISOString());
    expect(day.to.getTime() - day.from.getTime()).toBe(24 * 60 * 60 * 1000);
    const month = resolveAnalyticsRange('30d', now);
    expect(month.to.getTime() - month.from.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('uses collection start for all-time and honors custom dates', () => {
    const all = resolveAnalyticsRange('all', now, undefined, undefined, '2026-09-01T00:00:00.000Z');
    expect(all.from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    const custom = resolveAnalyticsRange('custom', now, '2026-08-01', '2026-08-15');
    expect(custom.from.toISOString().startsWith('2026-08-01')).toBe(true);
  });
});
