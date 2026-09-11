import { useMemo, useState } from 'react';
import { useAdminAnalytics } from '../hooks/useAdminAnalytics';
import type { AnalyticsEventRow, AnalyticsPreset } from '../lib/adminAnalytics';
import { formatRelativeTime } from '../lib/userDisplay';
import {
  BarChart,
  BreakdownTable,
  CohortGrid,
  FunnelChart,
  KpiCard,
  LineChart,
} from './analytics';
import {
  Banner,
  Button,
  EmptyState,
  Input,
  MonoMeta,
  RuledTable,
  SectionOpener,
  Select,
  Spinner,
} from './kit';

export function AdminAnalyticsPanel({
  enabled,
  onOpenUser,
}: {
  enabled: boolean;
  onOpenUser: (userId: string) => void;
}) {
  const {
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
    refetch,
  } = useAdminAnalytics(enabled);
  const [eventName, setEventName] = useState('');
  const [sortKey, setSortKey] = useState<'occurred_at' | 'name'>('occurred_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const events = useMemo(() => {
    const list = (data?.explorer.events ?? []).filter((row) => {
      if (eventName && row.name !== eventName) return false;
      if (filters.context && row.route && !row.route.includes(filters.context)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
      return (Date.parse(a.occurred_at) - Date.parse(b.occurred_at)) * dir;
    });
  }, [data, eventName, filters.context, sortDir, sortKey]);

  const eventNames = useMemo(() => {
    const set = new Set((data?.breakdowns.events ?? []).map((r) => r.key));
    return ['', ...[...set].sort()];
  }, [data]);

  if (!enabled) return null;

  return (
    <div className="admin-analytics">
      <div className="admin-analytics__filters">
        <Select
          aria-label="Date range"
          value={preset}
          onChange={(value) => setPreset(value as AnalyticsPreset)}
          options={[
            { value: '24h', label: 'Last 24 hours' },
            { value: '7d', label: 'Last 7 days' },
            { value: '30d', label: 'Last 30 days' },
            { value: '90d', label: 'Last 90 days' },
            { value: 'all', label: 'All collection' },
            { value: 'custom', label: 'Custom range' },
          ]}
        />
        {preset === 'custom' ? (
          <>
            <Input type="date" aria-label="From date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <Input type="date" aria-label="To date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </>
        ) : null}
        <Select
          aria-label="Scope"
          value={filters.scope}
          onChange={(value) => setFilters({ ...filters, scope: value as typeof filters.scope })}
          options={[
            { value: 'all', label: 'All sources' },
            { value: 'consented', label: 'Consented behavior' },
            { value: 'operational', label: 'Operational records' },
          ]}
        />
        <Select
          aria-label="User type"
          value={filters.user_type}
          onChange={(value) => setFilters({ ...filters, user_type: value as typeof filters.user_type })}
          options={[
            { value: 'all', label: 'New + returning' },
            { value: 'new', label: 'New users' },
            { value: 'returning', label: 'Returning users' },
          ]}
        />
        <Select
          aria-label="Device"
          value={filters.device}
          onChange={(value) => setFilters({ ...filters, device: value })}
          options={[
            { value: '', label: 'All devices' },
            { value: 'desktop', label: 'Desktop' },
            { value: 'mobile', label: 'Mobile' },
            { value: 'tablet', label: 'Tablet' },
          ]}
        />
        <Select
          aria-label="Auth method"
          value={filters.auth_method}
          onChange={(value) => setFilters({ ...filters, auth_method: value })}
          options={[
            { value: '', label: 'All auth methods' },
            { value: 'email', label: 'Email' },
            { value: 'google', label: 'Google' },
            { value: 'facebook', label: 'Facebook' },
          ]}
        />
        <Input
          aria-label="Route contains"
          placeholder="Route / source"
          value={filters.context}
          onChange={(e) => setFilters({ ...filters, context: e.target.value })}
        />
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Refresh
        </Button>
      </div>

      {data?.events_since ? (
        <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 16 }}>
          Consented event charts begin {formatRelativeTime(data.events_since)}. Relational totals
          are backfilled where timestamps already existed. Billing events stay at zero until those
          callsites ship.
        </MonoMeta>
      ) : (
        <Banner tone="info">
          First-party collection just launched. Operational KPIs below are trustworthy; consented
          behavior charts will fill in after cookie consent traffic arrives. This is not zero activity.
        </Banner>
      )}

      {error ? <Banner tone="error">{error}</Banner> : null}
      {loading && !data ? <Spinner label="Loading analytics…" /> : null}

      {data ? (
        <>
          <SectionOpener level={5} title="Executive health." note="Period vs previous window" />
          <div className="admin-analytics__kpis">
            {data.kpis.map((kpi) => (
              <KpiCard
                key={kpi.key}
                label={kpi.label}
                value={kpi.value}
                previous={kpi.previous}
                deltaPct={kpi.delta_pct}
                scope={kpi.scope}
                unavailable={kpi.unavailable}
              />
            ))}
          </div>

          <SectionOpener
            level={5}
            title="Growth and retention."
            note="Daily totals in this range. Axis numbers are counts, not percentages."
          />
          <div className="admin-analytics__grid">
            <LineChart
              title="Active users"
              points={data.timeseries.active_users?.points ?? []}
              unit="people / day"
              description="Distinct people with any recorded event that day, including backfilled rooms and signups."
            />
            <LineChart
              title="Sessions"
              points={data.timeseries.sessions?.points ?? []}
              unit="sessions / day"
              description="Cookie-consented visits. Stays at zero until people accept cookies and browse."
              emptyHint="No consented sessions in this range yet."
            />
            <LineChart
              title="Signups"
              points={data.timeseries.signups?.points ?? []}
              unit="new accounts / day"
              description="New accounts created each day."
            />
            <LineChart
              title="Rooms created"
              points={data.timeseries.rooms?.points ?? []}
              unit="rooms / day"
              description="Rooms opened each day. Can exceed signups because existing users keep creating rooms."
            />
          </div>
          <div className="admin-analytics__stickiness">
            <div>
              <strong>{data.stickiness.dau}</strong>
              <span>Daily active people (last 24h)</span>
            </div>
            <div>
              <strong>{data.stickiness.wau}</strong>
              <span>Weekly active people (last 7 days)</span>
            </div>
            <div>
              <strong>{data.stickiness.mau}</strong>
              <span>Monthly active people (last 30 days)</span>
            </div>
            <div>
              <strong>{data.stickiness.dau_wau ?? '—'}%</strong>
              <span>Stickiness: daily as a share of weekly</span>
            </div>
            <div>
              <strong>{data.stickiness.dau_mau ?? '—'}%</strong>
              <span>Stickiness: daily as a share of monthly</span>
            </div>
          </div>
          <div className="admin-analytics__grid">
            <FunnelChart
              title="Activation path"
              description="How far people get toward using the product. Visit and placement counts need cookie consent; signups and rooms come from the account database, so later steps can be larger than earlier ones."
              steps={data.funnels.activation.map((step) => ({
                ...step,
                hint:
                  step.key === 'visit'
                    ? 'Cookie-consented page views or sessions'
                    : step.key === 'signup'
                      ? 'New accounts created in this range'
                      : step.key === 'room'
                        ? 'Distinct people who created a room, including existing users'
                        : step.key === 'placement'
                          ? 'People who placed an item after accepting cookies'
                          : undefined,
              }))}
            />
            <CohortGrid rows={data.cohorts} />
          </div>

          <SectionOpener level={5} title="Product adoption." />
          <div className="admin-analytics__grid">
            <LineChart
              title="Items placed"
              points={data.timeseries.placements?.points ?? []}
              unit="placements / day"
              description="Furniture and decor added to rooms. Consented events only; operational item counts still appear in KPIs."
              emptyHint="No consented placements in this range yet."
            />
            <BreakdownTable
              title="Starter templates"
              description="Which room templates people actually opened."
              emptyHint="No room-created events with a template id in this range."
              dimensionLabel="Template"
              rows={data.breakdowns.templates ?? []}
            />
            <BreakdownTable
              title="Item kinds"
              description="What people put in rooms (beds, desks, lighting, and so on)."
              emptyHint="No room items in the catalog snapshot yet."
              dimensionLabel="Kind"
              rows={data.breakdowns.item_kind ?? []}
            />
            <BreakdownTable
              title="Where placements come from"
              description="Catalog, checklist, upload, or another entry point."
              emptyHint="No consented placement events in this range yet."
              dimensionLabel="Source"
              rows={data.breakdowns.item_source ?? []}
            />
            <BreakdownTable
              title="Share roles"
              description="Whether the person sharing was the owner or a collaborator."
              emptyHint="No share events in this range yet."
              dimensionLabel="Role"
              rows={data.breakdowns.share_role ?? []}
            />
            <BreakdownTable
              title="Room visibility"
              description="How published rooms are currently set: public vs private."
              emptyHint="No rooms to split by visibility."
              dimensionLabel="Visibility"
              rows={data.breakdowns.visibility ?? []}
            />
            <div className="analytics-breakdown">
              <h3 className="analytics-breakdown__title">Community mix</h3>
              <p className="analytics-chart__desc">Live inventory, not limited to this date range.</p>
              <dl className="analytics-stat-list">
                <div>
                  <dt>Public rooms</dt>
                  <dd>{data.community.public_rooms}</dd>
                </div>
                <div>
                  <dt>Private rooms</dt>
                  <dd>{data.community.private_rooms}</dd>
                </div>
                <div>
                  <dt>Public models</dt>
                  <dd>{data.community.public_models}</dd>
                </div>
                <div>
                  <dt>Reports this range</dt>
                  <dd>{data.community.reports}</dd>
                </div>
              </dl>
            </div>
          </div>

          <SectionOpener
            level={5}
            title="Search and commerce intent."
            note="Search, affiliate, and purchase steps need cookie consent. Checklist adds can still appear from saved shopping-list rows."
          />
          <div className="admin-analytics__grid">
            <FunnelChart
              title="From search to purchase"
              description="Did people look, save, click out, or buy? Purchase tracking is not live yet, so that last step stays n/a."
              steps={data.funnels.commerce.map((step) => ({
                ...step,
                hint:
                  step.key === 'search'
                    ? 'Catalog searches after cookie consent'
                    : step.key === 'checklist'
                      ? 'Items saved to a shopping list'
                      : step.key === 'affiliate'
                        ? 'Clicks out to a retailer'
                        : step.key === 'purchase'
                          ? 'Orders are not recorded in Toova yet'
                          : undefined,
              }))}
            />
            <div className="analytics-breakdown">
              <h3 className="analytics-breakdown__title">Search health</h3>
              <p className="analytics-chart__desc">
                How often catalog search returned nothing. Empty here means nobody has consented and
                searched yet — not that the catalog is unused.
              </p>
              <dl className="analytics-stat-list">
                <div>
                  <dt>Searches this range</dt>
                  <dd>{data.search.total}</dd>
                </div>
                <div>
                  <dt>Returned zero results</dt>
                  <dd>
                    {data.search.zero_results}
                    {data.search.total
                      ? ` (${Math.round((data.search.zero_results / data.search.total) * 1000) / 10}% of searches)`
                      : ' (no searches to rate)'}
                  </dd>
                </div>
              </dl>
            </div>
            <LineChart
              title="Affiliate clicks"
              points={data.timeseries.affiliate_clicks?.points ?? []}
              unit="clicks / day"
              description="Outbound retailer clicks after cookie consent."
              emptyHint="No affiliate clicks in this range yet."
            />
            <BreakdownTable
              title="What people typed"
              description="Most common catalog search strings, truncated to 80 characters."
              emptyHint="No consented catalog searches in this range yet. Queries appear after someone accepts cookies and uses search."
              dimensionLabel="Query"
              rows={data.breakdowns.top_queries ?? []}
            />
            <BreakdownTable
              title="Where they searched"
              description="Which part of the app the search ran from (catalog, checklist, and so on)."
              emptyHint="No consented searches with a context property yet."
              dimensionLabel="Surface"
              rows={data.breakdowns.search_context ?? []}
            />
            <BreakdownTable
              title="Affiliate retailers"
              description="Which storefronts received outbound clicks."
              emptyHint="No affiliate clicks in this range yet."
              dimensionLabel="Retailer"
              rows={data.breakdowns.affiliate_retailer ?? []}
            />
            <BreakdownTable
              title="Affiliate click surfaces"
              description="Where in the product the retailer link was clicked."
              emptyHint="No affiliate clicks in this range yet."
              dimensionLabel="Surface"
              rows={data.breakdowns.affiliate_surface ?? []}
            />
          </div>

          <SectionOpener level={5} title="Reliability." />
          <div className="admin-analytics__grid">
            <LineChart title="Generations started" points={data.timeseries.generations?.points ?? []} unit="jobs / day" description="Image-to-3D jobs started each day, from consented generation events." emptyHint="No consented generation starts in this range yet." />
            <div className="analytics-breakdown">
              <h3 className="analytics-breakdown__title">Generation health</h3>
              <p className="analytics-chart__desc">Operational job table for this range — not limited to cookie consent.</p>
              <dl className="analytics-stat-list">
                <div>
                  <dt>Jobs started</dt>
                  <dd>{data.reliability.started}</dd>
                </div>
                <div>
                  <dt>Succeeded</dt>
                  <dd>
                    {data.reliability.succeeded}
                    {data.reliability.success_rate != null ? ` (${data.reliability.success_rate}%)` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Failed</dt>
                  <dd>{data.reliability.failed}</dd>
                </div>
                <div>
                  <dt>Time to finish</dt>
                  <dd>
                    median {data.reliability.p50_ms != null ? `${Math.round(data.reliability.p50_ms)}ms` : '—'},
                    p95 {data.reliability.p95_ms != null ? `${Math.round(data.reliability.p95_ms)}ms` : '—'}
                  </dd>
                </div>
              </dl>
            </div>
            <BreakdownTable
              title="Job source"
              description="Whether generation jobs came from the in-app uploader or another entry point."
              emptyHint="No conversion jobs in this range."
              dimensionLabel="Source"
              rows={data.breakdowns.generation_source ?? []}
            />
            <BreakdownTable
              title="Job status"
              description="How those jobs ended: completed, failed, or still processing."
              emptyHint="No conversion jobs in this range."
              dimensionLabel="Status"
              rows={data.breakdowns.generation_status ?? []}
            />
            <BarChart
              title="Why generations failed"
              description="Most common failure reasons from consented generation events."
              emptyHint="No failed-generation events in this range yet."
              points={(data.reliability.failure_reasons ?? []).map((r) => ({ t: r.key, v: r.value, label: r.label }))}
            />
            <div className="analytics-breakdown">
              <h3 className="analytics-breakdown__title">Collector health</h3>
              <p className="analytics-chart__desc">First-party ingest for cookie-consented events. Admin sessions are excluded.</p>
              <dl className="analytics-stat-list">
                <div>
                  <dt>Consented events last 24h</dt>
                  <dd>{data.health.ingested_24h}</dd>
                </div>
                <div>
                  <dt>Last consented event</dt>
                  <dd>{data.health.last_event_at ? formatRelativeTime(data.health.last_event_at) : 'None yet'}</dd>
                </div>
                <div>
                  <dt>Backfilled operational rows</dt>
                  <dd>{data.health.backfill_rows}</dd>
                </div>
              </dl>
            </div>
          </div>

          <SectionOpener level={5} title="Event explorer." />
          <div className="admin-analytics__filters">
            <Select
              aria-label="Event name"
              value={eventName}
              onChange={setEventName}
              options={eventNames.map((name) => ({ value: name, label: name || 'All events' }))}
            />
          </div>
          {events.length === 0 ? (
            <EmptyState title="No events in this view." body="Consented traffic or backfill will appear here." />
          ) : (
            <div className="admin-analytics__table">
              <RuledTable
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={(key) => {
                  const next = key === 'name' ? 'name' : 'occurred_at';
                  if (sortKey === next) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                  else {
                    setSortKey(next);
                    setSortDir('desc');
                  }
                }}
                columns={[
                  { label: 'When', align: 'left', sortKey: 'occurred_at' },
                  { label: 'Event', align: 'left', sortKey: 'name' },
                  { label: 'User', align: 'left' },
                  { label: 'Route', align: 'left' },
                  { label: 'Source', align: 'left' },
                ]}
                rows={events.map((row) => eventRow(row, onOpenUser))}
              />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function eventRow(row: AnalyticsEventRow, onOpenUser: (userId: string) => void) {
  return [
    formatRelativeTime(row.occurred_at),
    row.name,
    row.user_id ? (
      <button type="button" className="analytics-linkish" onClick={() => onOpenUser(row.user_id!)}>
        {row.handle ? `@${row.handle}` : row.display_name || row.user_id.slice(0, 8)}
      </button>
    ) : (
      'anonymous'
    ),
    row.route ?? '—',
    row.source ?? '—',
  ];
}
