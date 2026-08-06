import { useMemo, useState, type CSSProperties } from 'react';
import {
  SUMMARY_LIMIT,
  type AdminBundlePairRow,
  type AdminConversionJobRow,
  type AdminInventoryStatRow,
  type AdminRoomRollupRow,
  type AdminUserRollupRow,
} from '../hooks/useAdminStats';
import { formatRelativeTime, shortenId } from '../lib/userDisplay';
import { AdminShoppingPanel } from './AdminShoppingPanel';
import {
  Badge,
  Banner,
  Button,
  DisplayHeading,
  EmptyState,
  Logo,
  MonoMeta,
  RuledTable,
  SectionOpener,
  Spinner,
} from './kit';

type AdminTab = 'overview' | 'users' | 'rooms' | 'jobs' | 'usage' | 'shopping';

type SortDir = 'asc' | 'desc';

type UserSortKey = 'account' | 'plan' | 'rooms' | 'placements' | 'active';
type RoomSortKey = 'room' | 'owner' | 'type' | 'items' | 'updated';
type JobSortKey = 'job' | 'owner' | 'source' | 'status' | 'created';

const NAV: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'usage', label: 'Usage' },
  { id: 'shopping', label: 'Shopping' },
];

const KIND_COLORS: Record<string, string> = {
  bed: '#C9B391', dresser: '#B08C5F', wardrobe: '#A88457', desk: '#B5946C',
  chair: '#CBB28F', nightstand: '#C0A47A', lamp: '#D4C4A0', imported: '#7E8A60',
};

const JOB_STATUS_ORDER: AdminConversionJobRow['status'][] = [
  'queued',
  'processing',
  'completed',
  'failed',
];

function swatch(kind: string) {
  const c = KIND_COLORS[kind] ?? '#CBB28F';
  return { width: 14, height: 14, borderRadius: 4, background: c, flex: 'none' as const };
}

function posterPanelStyle(): CSSProperties {
  return {
    background: 'var(--bg-raised)',
    border: '1px solid var(--rule-soft)',
    boxShadow: 'var(--shadow-panel)',
    padding: '18px 20px',
  };
}

function cmpText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

function cmpNum(a: number, b: number): number {
  return a - b;
}

function toggleSort<K extends string>(
  prevKey: K,
  prevDir: SortDir,
  nextKey: K,
): { key: K; dir: SortDir } {
  if (prevKey === nextKey) {
    return { key: nextKey, dir: prevDir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: nextKey, dir: 'asc' };
}

function jobStatusBadgeTone(
  status: AdminConversionJobRow['status'],
): 'accent' | 'neutral' | 'success' | 'danger' {
  switch (status) {
    case 'queued':
      return 'neutral';
    case 'processing':
      return 'accent';
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
  }
}

function sourceLabel(source: AdminConversionJobRow['source']): string {
  switch (source) {
    case 'trellis':
      return 'Image → 3D';
    case 'poster':
      return 'Poster';
    case 'upload':
      return 'Upload';
  }
}

export interface AdminConsoleProps {
  stats: AdminInventoryStatRow[];
  bundles: AdminBundlePairRow[];
  rooms: AdminRoomRollupRow[];
  users: AdminUserRollupRow[];
  jobs: AdminConversionJobRow[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
}

export function AdminConsole({
  stats,
  bundles,
  rooms,
  users,
  jobs,
  loading,
  error,
  onRefresh,
}: AdminConsoleProps) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [refreshLabel, setRefreshLabel] = useState('refreshed just now');
  const [userSortKey, setUserSortKey] = useState<UserSortKey>('placements');
  const [userSortDir, setUserSortDir] = useState<SortDir>('desc');
  const [roomSortKey, setRoomSortKey] = useState<RoomSortKey>('items');
  const [roomSortDir, setRoomSortDir] = useState<SortDir>('desc');
  const [jobSortKey, setJobSortKey] = useState<JobSortKey>('created');
  const [jobSortDir, setJobSortDir] = useState<SortDir>('desc');

  const metrics = useMemo(() => {
    const totalPlacements = users.reduce((s, u) => s + u.total_item_placements, 0);
    const totalLikes = stats.reduce((s, r) => s + r.likes_count, 0);
    return [
      { label: 'Total rooms', value: String(rooms.length), delta: 'across all users' },
      { label: 'Placements', value: String(totalPlacements), delta: 'room_items rows' },
      { label: 'Users', value: String(users.length), delta: 'with saved rooms' },
      { label: 'Catalog items', value: String(stats.length), delta: 'furniture kinds' },
      { label: 'Total likes', value: String(totalLikes), delta: 'catalog engagement' },
    ];
  }, [rooms.length, users, stats]);

  const jobsLast24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return jobs.filter((j) => {
      const t = Date.parse(j.created_at);
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [jobs]);

  const jobStatusCounts = useMemo(() => {
    const counts: Record<AdminConversionJobRow['status'], number> = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };
    for (const j of jobs) {
      counts[j.status] += 1;
    }
    return counts;
  }, [jobs]);

  const sortedJobs = useMemo(() => {
    const next = [...jobs];
    const dir = jobSortDir === 'asc' ? 1 : -1;
    next.sort((a, b) => {
      let cmp = 0;
      switch (jobSortKey) {
        case 'job':
          cmp = cmpText(a.label ?? a.kind ?? a.id, b.label ?? b.kind ?? b.id);
          break;
        case 'owner':
          cmp = cmpText(
            a.display_name ?? a.handle ?? a.user_id,
            b.display_name ?? b.handle ?? b.user_id,
          );
          break;
        case 'source':
          cmp = cmpText(a.source, b.source);
          break;
        case 'status':
          cmp = cmpNum(JOB_STATUS_ORDER.indexOf(a.status), JOB_STATUS_ORDER.indexOf(b.status));
          break;
        case 'created':
          cmp = cmpNum(Date.parse(a.created_at) || 0, Date.parse(b.created_at) || 0);
          break;
      }
      return cmp * dir;
    });
    return next;
  }, [jobSortDir, jobSortKey, jobs]);

  const topPlaced = useMemo(() => {
    const list = [...stats].sort((a, b) => b.in_room_count - a.in_room_count);
    const max = list[0]?.in_room_count ?? 1;
    return list.slice(0, 5).map((r) => ({
      name: r.label,
      kind: r.kind,
      placements: r.in_room_count,
      pct: Math.round((r.in_room_count / max) * 100),
    }));
  }, [stats]);

  const mostLiked = useMemo(() => {
    return [...stats].sort((a, b) => b.likes_count - a.likes_count).slice(0, SUMMARY_LIMIT);
  }, [stats]);

  const leastLiked = useMemo(() => {
    return [...stats].sort((a, b) => a.likes_count - b.likes_count).slice(0, SUMMARY_LIMIT);
  }, [stats]);

  const itemsRanked = useMemo(() => {
    const list = [...stats].sort((a, b) => b.distinct_room_count - a.distinct_room_count);
    const max = list[0]?.distinct_room_count ?? 1;
    return list.slice(0, 8).map((r) => ({
      name: r.label,
      kind: r.kind,
      distinct: r.distinct_room_count,
      placements: r.in_room_count,
      pct: Math.round((r.distinct_room_count / max) * 100),
    }));
  }, [stats]);

  const sortedUsers = useMemo(() => {
    const list = [...users];
    const dir = userSortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let c = 0;
      switch (userSortKey) {
        case 'account':
          c = cmpText(
            a.display_name ?? a.handle ?? a.user_id,
            b.display_name ?? b.handle ?? b.user_id,
          );
          break;
        case 'plan':
          c = 0;
          break;
        case 'rooms':
          c = cmpNum(a.room_count, b.room_count);
          break;
        case 'placements':
          c = cmpNum(a.total_item_placements, b.total_item_placements);
          break;
        case 'active':
          c = 0;
          break;
      }
      if (c === 0) c = cmpText(a.user_id, b.user_id);
      return c * dir;
    });
    return list;
  }, [users, userSortKey, userSortDir]);

  const sortedRooms = useMemo(() => {
    const list = [...rooms];
    const dir = roomSortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let c = 0;
      switch (roomSortKey) {
        case 'room':
          c = cmpText(a.room_name, b.room_name);
          break;
        case 'owner':
          c = cmpText(
            a.owner_display_name ?? a.owner_handle ?? a.owner_user_id,
            b.owner_display_name ?? b.owner_handle ?? b.owner_user_id,
          );
          break;
        case 'type':
          c = 0;
          break;
        case 'items':
          c = cmpNum(a.item_count, b.item_count);
          break;
        case 'updated': {
          const at = a.updated_at ? Date.parse(a.updated_at) : 0;
          const bt = b.updated_at ? Date.parse(b.updated_at) : 0;
          c = cmpNum(at, bt);
          break;
        }
      }
      if (c === 0) c = cmpText(a.room_id, b.room_id);
      return c * dir;
    });
    return list;
  }, [rooms, roomSortKey, roomSortDir]);

  async function handleRefresh() {
    await onRefresh();
    setRefreshLabel('refreshed just now');
  }

  const tabTitle = NAV.find((n) => n.id === tab)?.label ?? 'Overview';

  return (
    <div className="admin-console">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <Logo size={22} wordmark className="admin-sidebar-logo" inverse alt="Toova" />
        </div>
        <MonoMeta size="xs" upper className="kit-mono-meta--inverse" style={{ padding: '6px 10px 14px', display: 'block' }}>
          Admin console
        </MonoMeta>
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`admin-nav-item${tab === n.id ? ' active' : ''}`}
            style={{ background: 'none', border: 'none', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}
            onClick={() => setTab(n.id)}
          >
            {n.label}
          </button>
        ))}
      </aside>

      <div className="admin-main tv-scroll">
        <div className="admin-content">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 26, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <MonoMeta size="xs" upper style={{ display: 'block', marginBottom: 8, color: 'var(--accent-text)' }}>
                {tabTitle}
              </MonoMeta>
              <SectionOpener level={4} title={`${tabTitle}.`} />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Button size="sm" variant="outline" onClick={() => void handleRefresh()}>
                Refresh
              </Button>
              <MonoMeta size="sm" tone="dense">{refreshLabel}</MonoMeta>
            </div>
          </div>

          {error ? <Banner tone="error">{error}</Banner> : null}
          {loading ? <Spinner label="Loading admin data…" /> : null}

          {tab === 'overview' && !loading ? (
            <>
              <div className="admin-metrics">
                {metrics.map((m) => (
                  <div key={m.label} style={posterPanelStyle()}>
                    <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 8 }}>
                      {m.label}
                    </MonoMeta>
                    <DisplayHeading level={5} as="div">{m.value}</DisplayHeading>
                    <MonoMeta size="xs" style={{ display: 'block', marginTop: 6, color: 'var(--accent-text)' }}>
                      {m.delta}
                    </MonoMeta>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
                <div style={posterPanelStyle()}>
                  <SectionOpener level={5} title="Conversion jobs." note="Last 24h" style={{ marginBottom: 12 }} />
                  <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 18 }}>
                    Image → 3D / import pipeline throughput
                  </MonoMeta>
                  {jobsLast24h.length === 0 ? (
                    <MonoMeta size="sm" tone="dense" style={{ fontStyle: 'italic' }}>
                      No conversion jobs in the last 24 hours.
                    </MonoMeta>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                      {JOB_STATUS_ORDER.map((status) => {
                        const count = jobsLast24h.filter((j) => j.status === status).length;
                        return (
                          <div key={status}>
                            <MonoMeta size="xs" tone="dense" style={{ display: 'block', marginBottom: 4, textTransform: 'capitalize' }}>
                              {status}
                            </MonoMeta>
                            <DisplayHeading level={5} as="div">{count}</DisplayHeading>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div style={posterPanelStyle()}>
                  <SectionOpener level={5} title="Most placed pieces." style={{ marginBottom: 16 }} />
                  {topPlaced.map((t) => (
                    <div key={t.kind} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={swatch(t.kind)} />
                      <span style={{ flex: 1, font: 'var(--type-ui-sm)' }}>{t.name}</span>
                      <div style={{ width: 90, height: 7, borderRadius: 99, background: '#E8DECB', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${t.pct}%`, background: 'var(--accent)' }} />
                      </div>
                      <MonoMeta size="sm" tone="dense" style={{ width: 26, textAlign: 'right' }}>
                        {t.placements}
                      </MonoMeta>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {tab === 'users' && !loading ? (
            users.length === 0 ? (
              <EmptyState title="No users with rooms yet." />
            ) : (
              <RuledTable
                sortKey={userSortKey}
                sortDir={userSortDir}
                onSort={(key) => {
                  const next = toggleSort(userSortKey, userSortDir, key as UserSortKey);
                  setUserSortKey(next.key);
                  setUserSortDir(next.dir);
                }}
                columns={[
                  { label: 'Account', sortKey: 'account', align: 'left' },
                  { label: 'Plan', sortKey: 'plan', align: 'left' },
                  { label: 'Rooms', sortKey: 'rooms', align: 'right' },
                  { label: 'Placements', sortKey: 'placements', align: 'right' },
                  { label: 'Last active', sortKey: 'active', align: 'right' },
                ]}
                rows={sortedUsers.map((u) => {
                  const initials = (u.display_name ?? u.handle ?? u.user_id)
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() ?? '')
                    .join('') || '?';
                  return [
                  <div key={`${u.user_id}-acct`} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 99, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>
                      {initials}
                    </div>
                    <div>
                      <div style={{ font: 'var(--type-ui-sm)', fontWeight: 600 }}>
                        {u.display_name ?? 'Unnamed'}
                      </div>
                      <MonoMeta size="xs" tone="dense" title={u.user_id}>
                        {u.handle ? `@${u.handle}` : 'no handle'}
                        {' · '}
                        {shortenId(u.user_id)}
                      </MonoMeta>
                    </div>
                  </div>,
                  <Badge key={`${u.user_id}-plan`} tone="accent">Free</Badge>,
                  <MonoMeta key={`${u.user_id}-rooms`} size="sm">{String(u.room_count)}</MonoMeta>,
                  <MonoMeta key={`${u.user_id}-placements`} size="sm">{String(u.total_item_placements)}</MonoMeta>,
                  <MonoMeta key={`${u.user_id}-active`} size="sm" tone="dense">—</MonoMeta>,
                ];
                })}
              />
            )
          ) : null}

          {tab === 'rooms' && !loading ? (
            rooms.length === 0 ? (
              <EmptyState title="No rooms yet." />
            ) : (
              <RuledTable
                sortKey={roomSortKey}
                sortDir={roomSortDir}
                onSort={(key) => {
                  const next = toggleSort(roomSortKey, roomSortDir, key as RoomSortKey);
                  setRoomSortKey(next.key);
                  setRoomSortDir(next.dir);
                }}
                columns={[
                  { label: 'Room', sortKey: 'room', align: 'left' },
                  { label: 'Owner', sortKey: 'owner', align: 'left' },
                  { label: 'Type', sortKey: 'type', align: 'left' },
                  { label: 'Items', sortKey: 'items', align: 'right' },
                  { label: 'Updated', sortKey: 'updated', align: 'right' },
                ]}
                rows={sortedRooms.map((r) => [
                  <span key={`${r.room_id}-name`} style={{ font: 'var(--type-ui-sm)', fontWeight: 600 }}>{r.room_name}</span>,
                  <div key={`${r.room_id}-owner`}>
                    <div style={{ font: 'var(--type-ui-sm)' }}>
                      {r.owner_display_name ?? 'Unnamed'}
                    </div>
                    <MonoMeta size="xs" tone="dense" title={r.owner_user_id}>
                      {r.owner_handle ? `@${r.owner_handle}` : shortenId(r.owner_user_id)}
                    </MonoMeta>
                  </div>,
                  <Badge key={`${r.room_id}-type`} tone="accent">Room</Badge>,
                  <MonoMeta key={`${r.room_id}-items`} size="sm">{String(r.item_count)}</MonoMeta>,
                  <MonoMeta key={`${r.room_id}-updated`} size="sm" tone="dense">
                    {r.updated_at ? formatRelativeTime(r.updated_at) : '—'}
                  </MonoMeta>,
                ])}
              />
            )
          ) : null}

          {tab === 'jobs' && !loading ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
                {JOB_STATUS_ORDER.map((status) => (
                  <div key={status} style={posterPanelStyle()}>
                    <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 6, textTransform: 'capitalize' }}>
                      {status}
                    </MonoMeta>
                    <DisplayHeading level={5} as="div">{jobStatusCounts[status]}</DisplayHeading>
                  </div>
                ))}
              </div>
              {sortedJobs.length === 0 ? (
                <EmptyState
                  title="No conversion jobs yet."
                  body="Imports and image → 3D generations will appear here once users run them."
                />
              ) : (
                <RuledTable
                  sortKey={jobSortKey}
                  sortDir={jobSortDir}
                  onSort={(key) => {
                    const next = toggleSort(jobSortKey, jobSortDir, key as JobSortKey);
                    setJobSortKey(next.key);
                    setJobSortDir(next.dir);
                  }}
                  columns={[
                    { label: 'Job', sortKey: 'job', align: 'left' },
                    { label: 'Owner', sortKey: 'owner', align: 'left' },
                    { label: 'Source', sortKey: 'source', align: 'left' },
                    { label: 'Status', sortKey: 'status', align: 'left' },
                    { label: 'Created', sortKey: 'created', align: 'right' },
                  ]}
                  rows={sortedJobs.map((j) => [
                    <div key={`${j.id}-job`}>
                      <div style={{ font: 'var(--type-ui-sm)', fontWeight: 600 }}>
                        {j.label ?? j.kind ?? 'Untitled job'}
                      </div>
                      {j.error ? (
                        <MonoMeta size="xs" tone="dense" title={j.error} style={{ color: 'var(--danger, #B33)' }}>
                          {j.error.length > 72 ? `${j.error.slice(0, 71)}…` : j.error}
                        </MonoMeta>
                      ) : j.kind ? (
                        <MonoMeta size="xs" tone="dense">{j.kind}</MonoMeta>
                      ) : null}
                    </div>,
                    <div key={`${j.id}-owner`}>
                      <div style={{ font: 'var(--type-ui-sm)' }}>
                        {j.display_name ?? 'Unnamed'}
                      </div>
                      <MonoMeta size="xs" tone="dense" title={j.user_id}>
                        {j.handle ? `@${j.handle}` : shortenId(j.user_id)}
                      </MonoMeta>
                    </div>,
                    <MonoMeta key={`${j.id}-source`} size="sm">{sourceLabel(j.source)}</MonoMeta>,
                    <Badge key={`${j.id}-status`} tone={jobStatusBadgeTone(j.status)}>
                      {j.status}
                    </Badge>,
                    <MonoMeta key={`${j.id}-created`} size="sm" tone="dense">
                      {j.created_at ? formatRelativeTime(j.created_at) : '—'}
                    </MonoMeta>,
                  ])}
                />
              )}
            </>
          ) : null}

          {tab === 'usage' && !loading ? (
            <>
              <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 16, maxWidth: 680 }}>
                Every model stores its label, kind, tags and description alongside live usage.
                Distinct rooms = unique saved rooms containing the kind.
                Placements = every row in room_items.
              </MonoMeta>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                <div style={posterPanelStyle()}>
                  <SectionOpener level={5} title="Suggested bundles." note="Review only" style={{ marginBottom: 4 }} />
                  <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 14 }}>
                    Kinds that often appear together (≥ 2 rooms).
                  </MonoMeta>
                  {bundles.length === 0 ? (
                    <MonoMeta size="sm" tone="dense">No qualifying pairs yet.</MonoMeta>
                  ) : (
                    <RuledTable
                      columns={[{ label: 'Pair' }, { label: 'Rooms', align: 'right' }]}
                      rows={bundles.map((b) => [
                        <div key={`${b.kind_a}-${b.kind_b}`} style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--type-ui-sm)' }}>
                          <span style={swatch(b.kind_a)} />{b.label_a}{' '}
                          <span style={{ color: '#C9BBA0' }}>+</span>{' '}
                          <span style={swatch(b.kind_b)} />{b.label_b}
                        </div>,
                        <Badge key={`${b.kind_a}-${b.kind_b}-count`} tone="neutral">{b.room_cooccurrence_count} rooms</Badge>,
                      ])}
                    />
                  )}
                </div>

                <div style={posterPanelStyle()}>
                  <SectionOpener level={5} title="Items and rooms." style={{ marginBottom: 14 }} />
                  {itemsRanked.map((i) => (
                    <div key={i.kind} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--rule-soft)' }}>
                      <span style={swatch(i.kind)} />
                      <span style={{ flex: 1, font: 'var(--type-ui-sm)' }}>{i.name}</span>
                      <div style={{ width: 74, height: 7, borderRadius: 99, background: '#E8DECB', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${i.pct}%`, background: 'var(--accent)' }} />
                      </div>
                      <MonoMeta size="sm" tone="dense" style={{ width: 62, textAlign: 'right' }}>
                        {i.distinct}r · {i.placements}p
                      </MonoMeta>
                    </div>
                  ))}
                </div>

                <div style={posterPanelStyle()}>
                  <SectionOpener level={5} title="Most liked." style={{ marginBottom: 14 }} />
                  {mostLiked.map((m) => (
                    <div key={m.kind} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', font: 'var(--type-ui-sm)' }}>
                      <span style={swatch(m.kind)} /><span style={{ flex: 1 }}>{m.label}</span>
                      <MonoMeta size="sm" style={{ color: 'var(--accent-text)' }}>♥ {m.likes_count}</MonoMeta>
                    </div>
                  ))}
                </div>

                <div style={posterPanelStyle()}>
                  <SectionOpener level={5} title="Least liked." style={{ marginBottom: 14 }} />
                  {leastLiked.map((m) => (
                    <div key={m.kind} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', font: 'var(--type-ui-sm)' }}>
                      <span style={swatch(m.kind)} /><span style={{ flex: 1 }}>{m.label}</span>
                      <Badge tone="danger">♥ {m.likes_count}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <SectionOpener level={5} title="Catalog inventory." style={{ marginBottom: 16 }} />
              <div className="admin-catalog-grid">
                {stats.map((c) => (
                  <div key={c.kind} style={{ ...posterPanelStyle(), display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <div style={{ ...swatch(c.kind), width: 48, height: 48, borderRadius: 10 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ font: 'var(--type-ui-sm)', fontWeight: 700, lineHeight: 1.2, marginBottom: 6 }}>{c.label}</div>
                        <Badge tone="accent">{c.kind}</Badge>
                      </div>
                    </div>
                    {c.tags.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {c.tags.map((t) => (
                          <Badge key={t} tone="neutral">{t}</Badge>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ font: 'var(--type-body-sm)', lineHeight: 1.5, color: 'var(--ink-4)', marginBottom: 14, flex: 1 }}>{c.description || '—'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, borderTop: '1px solid var(--rule-soft)', paddingTop: 12 }}>
                      {[
                        { label: 'rooms', value: c.distinct_room_count },
                        { label: 'placed', value: c.in_room_count },
                        { label: 'likes', value: c.likes_count, accent: true },
                        { label: 'dl', value: c.downloads_count },
                        { label: 'views', value: c.views_count },
                      ].map((stat) => (
                        <div key={stat.label} title={stat.label}>
                          <MonoMeta size="sm" style={stat.accent ? { color: 'var(--accent-text)' } : undefined}>{String(stat.value)}</MonoMeta>
                          <MonoMeta size="xs" tone="dense" upper style={{ display: 'block' }}>{stat.label}</MonoMeta>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {tab === 'shopping' ? <AdminShoppingPanel /> : null}
        </div>
      </div>
    </div>
  );
}
