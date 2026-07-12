import { useMemo, useState } from 'react';
import {
  SUMMARY_LIMIT,
  type AdminBundlePairRow,
  type AdminInventoryStatRow,
  type AdminRoomRollupRow,
  type AdminUserRollupRow,
} from '../hooks/useAdminStats';
import { shortenId } from '../lib/userDisplay';

type AdminTab = 'overview' | 'users' | 'rooms' | 'jobs' | 'usage';

const NAV: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'usage', label: 'Usage' },
];

const KIND_COLORS: Record<string, string> = {
  bed: '#C9B391', dresser: '#B08C5F', wardrobe: '#A88457', desk: '#B5946C',
  chair: '#CBB28F', nightstand: '#C0A47A', imported: '#7E8A60',
};

function swatch(kind: string) {
  const c = KIND_COLORS[kind] ?? '#CBB28F';
  return { width: 14, height: 14, borderRadius: 4, background: c, flex: 'none' as const };
}

export interface AdminConsoleProps {
  stats: AdminInventoryStatRow[];
  bundles: AdminBundlePairRow[];
  rooms: AdminRoomRollupRow[];
  users: AdminUserRollupRow[];
  loading: boolean;
  error: string | null;
  onExit: () => void;
  onRefresh: () => Promise<void>;
}

export function AdminConsole({
  stats,
  bundles,
  rooms,
  users,
  loading,
  error,
  onExit,
  onRefresh,
}: AdminConsoleProps) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [refreshLabel, setRefreshLabel] = useState('refreshed just now');

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

  async function handleRefresh() {
    await onRefresh();
    setRefreshLabel('refreshed just now');
  }

  const tabTitle = NAV.find((n) => n.id === tab)?.label ?? 'Overview';

  return (
    <div className="admin-console">
      <aside className="admin-sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 8px' }}>
          <div className="tv-logo-mark" style={{ width: 24, height: 24, borderRadius: 7, fontSize: 17 }}>t</div>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600, color: '#F8F3EA' }}>Toova</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.1em', color: 'rgba(244,238,228,.4)', padding: '6px 10px 14px' }}>ADMIN CONSOLE</div>
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
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onExit} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: 9, color: 'rgba(244,238,228,.55)', fontSize: 13, cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'inherit', width: '100%' }}>
          ← Back to app
        </button>
      </aside>

      <div className="admin-main tv-scroll">
        <div className="admin-content">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 26, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{tabTitle}</div>
              <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 32, letterSpacing: '-.01em', margin: '4px 0 0' }}>{tabTitle}</h1>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" onClick={() => void handleRefresh()} style={{ cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', fontFamily: 'inherit', fontSize: 13, padding: '8px 14px', borderRadius: 8 }}>Refresh</button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-subtle)' }}>{refreshLabel}</span>
            </div>
          </div>

          {error ? <div className="tv-banner-error" role="alert">{error}</div> : null}
          {loading ? <p style={{ color: 'var(--text-subtle)' }}>Loading admin data…</p> : null}

          {tab === 'overview' && !loading ? (
            <>
              <div className="admin-metrics">
                {metrics.map((m) => (
                  <div key={m.label} className="admin-metric-card">
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{m.label}</div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 500, letterSpacing: '-.01em' }}>{m.value}</div>
                    <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6 }}>{m.delta}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
                <div className="admin-card">
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Conversion jobs · last 24h</div>
                  <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginBottom: 18 }}>Image → 3D pipeline throughput</div>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>No conversion jobs tracked yet — pipeline status is not persisted in the database.</p>
                </div>
                <div className="admin-card">
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Most placed pieces</div>
                  {topPlaced.map((t) => (
                    <div key={t.kind} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={swatch(t.kind)} />
                      <span style={{ flex: 1, fontSize: 14 }}>{t.name}</span>
                      <div style={{ width: 90, height: 7, borderRadius: 99, background: '#E8DECB', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${t.pct}%`, background: 'var(--accent)' }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', width: 26, textAlign: 'right' }}>{t.placements}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {tab === 'users' && !loading ? (
            <div className="admin-table-wrap">
              <div className="admin-table-row admin-table-head" style={{ gridTemplateColumns: '2fr 1fr .8fr .8fr 1fr' }}>
                <div>Account</div><div>Plan</div><div>Rooms</div><div>Placements</div><div>Last active</div>
              </div>
              {users.map((u) => (
                <div key={u.user_id} className="admin-table-row" style={{ gridTemplateColumns: '2fr 1fr .8fr .8fr 1fr' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 99, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>
                      {u.user_id.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }} title={u.user_id}>{shortenId(u.user_id)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>—</div>
                    </div>
                  </div>
                  <div><span style={{ fontSize: 12, background: 'var(--accent-bg)', color: 'var(--accent)', padding: '3px 9px', borderRadius: 99, fontWeight: 600 }}>Free</span></div>
                  <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dark)' }}>{u.room_count}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dark)' }}>{u.total_item_placements}</div>
                  <div style={{ color: 'var(--text-muted)' }}>—</div>
                </div>
              ))}
              {users.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-subtle)' }}>No users with rooms yet.</div> : null}
            </div>
          ) : null}

          {tab === 'rooms' && !loading ? (
            <div className="admin-table-wrap">
              <div className="admin-table-row admin-table-head" style={{ gridTemplateColumns: '1.6fr 1fr 1.2fr .8fr 1fr' }}>
                <div>Room</div><div>Owner</div><div>Type</div><div>Items</div><div>Updated</div>
              </div>
              {rooms.map((r) => (
                <div key={r.room_id} className="admin-table-row" style={{ gridTemplateColumns: '1.6fr 1fr 1.2fr .8fr 1fr' }}>
                  <div style={{ fontWeight: 600 }}>{r.room_name}</div>
                  <div style={{ color: 'var(--text-dark)' }} title={r.owner_user_id}>{shortenId(r.owner_user_id)}</div>
                  <div><span style={{ fontSize: 12, background: 'var(--accent-bg)', color: 'var(--accent)', padding: '3px 9px', borderRadius: 99, fontWeight: 600 }}>Room</span></div>
                  <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dark)' }}>{r.item_count}</div>
                  <div style={{ color: 'var(--text-muted)' }}>—</div>
                </div>
              ))}
              {rooms.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-subtle)' }}>No rooms yet.</div> : null}
            </div>
          ) : null}

          {tab === 'jobs' && !loading ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
                {['Queued', 'Processing', 'Completed', 'Failed'].map((label) => (
                  <div key={label} className="admin-metric-card">
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 500 }}>0</div>
                  </div>
                ))}
              </div>
              <div className="admin-card" style={{ textAlign: 'center', padding: 48 }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, marginBottom: 8 }}>No conversion jobs tracked yet</div>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto' }}>
                  Image → 3D generation runs on demand but job status is not persisted. This section will populate when a jobs table is added.
                </p>
              </div>
            </>
          ) : null}

          {tab === 'usage' && !loading ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginBottom: 16, maxWidth: 680 }}>
                Every model stores its label, kind, tags and description alongside live usage.
                <b> Distinct rooms</b> = unique saved rooms containing the kind.
                <b> Placements</b> = every row in room_items.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                <div className="admin-card">
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Suggested bundles <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>· review only</span></div>
                  <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginBottom: 14 }}>Kinds that often appear together (≥ 2 rooms).</div>
                  {bundles.map((b) => (
                    <div key={`${b.kind_a}-${b.kind_b}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #EFE7D8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                        <span style={swatch(b.kind_a)} />{b.label_a} <span style={{ color: '#C9BBA0' }}>+</span> <span style={swatch(b.kind_b)} />{b.label_b}
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg)', padding: '3px 9px', borderRadius: 99 }}>{b.room_cooccurrence_count} rooms</span>
                    </div>
                  ))}
                  {bundles.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>No qualifying pairs yet.</p> : null}
                </div>

                <div className="admin-card">
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Items &amp; rooms</div>
                  {itemsRanked.map((i) => (
                    <div key={i.kind} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #EFE7D8' }}>
                      <span style={swatch(i.kind)} />
                      <span style={{ flex: 1, fontSize: 14 }}>{i.name}</span>
                      <div style={{ width: 74, height: 7, borderRadius: 99, background: '#E8DECB', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${i.pct}%`, background: 'var(--accent)' }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', width: 62, textAlign: 'right' }}>{i.distinct}r · {i.placements}p</span>
                    </div>
                  ))}
                </div>

                <div className="admin-card">
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Most liked</div>
                  {mostLiked.map((m) => (
                    <div key={m.kind} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', fontSize: 14 }}>
                      <span style={swatch(m.kind)} /><span style={{ flex: 1 }}>{m.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: '#6E7A56', fontSize: 13 }}>♥ {m.likes_count}</span>
                    </div>
                  ))}
                </div>

                <div className="admin-card">
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Least liked</div>
                  {leastLiked.map((m) => (
                    <div key={m.kind} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', fontSize: 14 }}>
                      <span style={swatch(m.kind)} /><span style={{ flex: 1 }}>{m.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--danger)', fontSize: 13 }}>♥ {m.likes_count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="admin-catalog-grid">
                {stats.map((c) => (
                  <div key={c.kind} className="admin-catalog-card">
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <div style={{ ...swatch(c.kind), width: 48, height: 48, borderRadius: 10 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{c.label}</div>
                        <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--accent-bg)', color: 'var(--accent)', padding: '2px 9px', borderRadius: 99 }}>{c.kind}</span>
                      </div>
                    </div>
                    {c.tags.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {c.tags.map((t) => (
                          <span key={t} style={{ fontSize: 11, color: 'var(--text-muted)', background: '#EDE5D8', padding: '3px 8px', borderRadius: 6 }}>{t}</span>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 13, lineHeight: 1.5, color: '#6B6357', marginBottom: 14, flex: 1 }}>{c.description || '—'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, borderTop: '1px solid #E8DECB', paddingTop: 12 }}>
                      <div title="Distinct rooms"><div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500 }}>{c.distinct_room_count}</div><div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>rooms</div></div>
                      <div title="Placements"><div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500 }}>{c.in_room_count}</div><div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>placed</div></div>
                      <div title="Likes"><div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500, color: '#6E7A56' }}>{c.likes_count}</div><div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>likes</div></div>
                      <div title="Downloads"><div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500 }}>{c.downloads_count}</div><div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>dl</div></div>
                      <div title="Views"><div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500 }}>{c.views_count}</div><div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>views</div></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
