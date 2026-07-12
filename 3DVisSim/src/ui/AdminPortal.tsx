import { useMemo, useState } from 'react';
import {
  SUMMARY_LIMIT,
  type AdminBundlePairRow,
  type AdminInventoryStatRow,
  type AdminRoomRollupRow,
  type AdminUserRollupRow,
} from '../hooks/useAdminStats';

export type InventorySortColumn =
  | 'label'
  | 'kind'
  | 'tags_joined'
  | 'description'
  | 'distinct_room_count'
  | 'in_room_count'
  | 'likes_count'
  | 'downloads_count'
  | 'views_count';

export interface AdminPortalProps {
  stats: AdminInventoryStatRow[];
  bundles: AdminBundlePairRow[];
  rooms: AdminRoomRollupRow[];
  users: AdminUserRollupRow[];
  loading: boolean;
  error: string | null;
  onExit: () => void;
  onRefresh: () => Promise<void>;
}

function sortArrow(active: boolean, dir: 'asc' | 'desc'): string {
  if (!active) return '⇅';
  return dir === 'asc' ? '↑' : '↓';
}

function compareNum(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function compareLocale(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function tagsStableKey(tags: string[]): string {
  return [...tags].map((t) => t.trim()).filter(Boolean).sort().join(', ').toLowerCase();
}

function ellipsize(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

function shortenId(id: string): string {
  if (!id) return '—';
  if (id.length <= 13) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

const INV_COL_COUNT = 9;

export function AdminPortal({
  stats,
  bundles,
  rooms,
  users,
  loading,
  error,
  onExit,
  onRefresh,
}: AdminPortalProps) {
  const [sortColumn, setSortColumn] = useState<InventorySortColumn>('likes_count');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedRows = useMemo(() => {
    const next = [...stats];
    next.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'kind':
          cmp = compareLocale(a.kind, b.kind);
          break;
        case 'label':
          cmp = compareLocale(a.label, b.label);
          break;
        case 'tags_joined':
          cmp = compareLocale(tagsStableKey(a.tags), tagsStableKey(b.tags));
          break;
        case 'description':
          cmp = compareLocale(a.description ?? '', b.description ?? '');
          break;
        case 'distinct_room_count':
          cmp = compareNum(a.distinct_room_count, b.distinct_room_count);
          break;
        case 'in_room_count':
          cmp = compareNum(a.in_room_count, b.in_room_count);
          break;
        case 'likes_count':
          cmp = compareNum(a.likes_count, b.likes_count);
          break;
        case 'downloads_count':
          cmp = compareNum(a.downloads_count, b.downloads_count);
          break;
        case 'views_count':
          cmp = compareNum(a.views_count, b.views_count);
          break;
        default:
          cmp = 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return next;
  }, [sortColumn, sortDir, stats]);

  const mostLiked = useMemo(() => {
    const list = [...stats];
    list.sort((a, b) => compareNum(b.likes_count, a.likes_count) || compareLocale(a.label, b.label));
    return list.slice(0, SUMMARY_LIMIT);
  }, [stats]);

  const leastLiked = useMemo(() => {
    const list = [...stats];
    list.sort((a, b) => compareNum(a.likes_count, b.likes_count) || compareLocale(a.label, b.label));
    return list.slice(0, SUMMARY_LIMIT);
  }, [stats]);

  const itemsRoomsSorted = useMemo(() => {
    const list = [...stats];
    list.sort(
      (a, b) =>
        compareNum(b.distinct_room_count, a.distinct_room_count) || compareLocale(a.label, b.label),
    );
    return list;
  }, [stats]);

  function toggleColumn(col: InventorySortColumn) {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortColumn(col);
    setSortDir('asc');
  }

  async function handleRefresh() {
    await onRefresh();
  }

  return (
    <div className="admin-portal">
      <header className="admin-header">
        <div className="admin-header-actions">
          <h1 className="admin-title">Toova Admin</h1>
          <p className="admin-subtitle">
            Catalog metrics (likes, downloads, views) plus placements in rooms — per-room and per-user rollups below.
          </p>
        </div>
        <div className="admin-toolbar">
          <button type="button" className="admin-btn-secondary" onClick={() => void handleRefresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="admin-btn-exit" onClick={onExit}>
            Exit dashboard
          </button>
        </div>
      </header>

      {error ? (
        <div className="admin-banner admin-banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <main className="admin-main">
        {!loading && stats.length > 0 ? (
          <section className="admin-summary" aria-label="Like highlights">
            <div className="admin-summary-col">
              <h2 className="admin-summary-heading">Most liked (catalog)</h2>
              <ul className="admin-summary-list">
                {mostLiked.map((row) => (
                  <li key={row.kind} className="admin-summary-item">
                    <span className="admin-summary-label">{row.label}</span>{' '}
                    <code className="admin-code admin-summary-kind">{row.kind}</code>{' '}
                    <span className="admin-badge admin-badge-likes">{row.likes_count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="admin-summary-col">
              <h2 className="admin-summary-heading">Least liked (catalog)</h2>
              <ul className="admin-summary-list">
                {leastLiked.map((row) => (
                  <li key={row.kind} className="admin-summary-item">
                    <span className="admin-summary-label">{row.label}</span>{' '}
                    <code className="admin-code admin-summary-kind">{row.kind}</code>{' '}
                    <span className="admin-badge admin-badge-likes">{row.likes_count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <section className="admin-section admin-section-items-rooms" aria-label="Items and rooms">
          <h2 className="admin-section-title">Items &amp; rooms</h2>
          <p className="admin-section-lede">
            For each catalog item: how many <strong>distinct saved rooms</strong> include at least one placement
            (Rooms with item), and total placement instances (Placements). Sorted by Rooms with item (high first).
          </p>
          <div className="admin-table-wrap admin-table-wrap-tight admin-table-wrap-items-rooms">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Label</th>
                  <th scope="col">Kind</th>
                  <th scope="col" className="admin-num">
                    Rooms with item
                  </th>
                  <th scope="col" className="admin-num">
                    Placements
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="admin-loading-cell" colSpan={4}>
                      Loading item reach…
                    </td>
                  </tr>
                ) : stats.length === 0 ? (
                  <tr>
                    <td className="admin-empty-inline" colSpan={4}>
                      No catalog data.
                    </td>
                  </tr>
                ) : (
                  itemsRoomsSorted.map((row) => (
                    <tr key={row.kind}>
                      <td>{row.label}</td>
                      <td>
                        <code className="admin-code">{row.kind}</code>
                      </td>
                      <td className="admin-num">
                        <span className="admin-badge admin-badge-rooms">{row.distinct_room_count}</span>
                      </td>
                      <td className="admin-num">
                        <span className="admin-badge admin-badge-placements">{row.in_room_count}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section admin-section-bundles" aria-label="Suggested bundles">
          <h2 className="admin-section-title">Suggested bundles (pairs)</h2>
          <p className="admin-section-lede admin-bundle-intro">
            Kinds that often appear together in the same saved room (&ge; 2 rooms by default — tune in RPC). Listed for
            review only; bundles are not created automatically.
          </p>
          <div className="admin-table-wrap admin-table-wrap-tight">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Item A</th>
                  <th scope="col">Item B</th>
                  <th scope="col" className="admin-num">
                    Rooms together
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="admin-loading-cell" colSpan={3}>
                      Loading bundle hints…
                    </td>
                  </tr>
                ) : bundles.length === 0 ? (
                  <tr>
                    <td className="admin-empty-inline" colSpan={3}>
                      No qualifying pairs yet (need overlapping kinds across multiple rooms).
                    </td>
                  </tr>
                ) : (
                  bundles.map((b) => (
                    <tr key={`${b.kind_a}::${b.kind_b}`}>
                      <td>
                        <span className="admin-bundle-cell-label">{b.label_a}</span>{' '}
                        <code className="admin-code">{b.kind_a}</code>
                      </td>
                      <td>
                        <span className="admin-bundle-cell-label">{b.label_b}</span>{' '}
                        <code className="admin-code">{b.kind_b}</code>
                      </td>
                      <td className="admin-num">{b.room_cooccurrence_count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section" aria-label="Rooms">
          <h2 className="admin-section-title">Rooms &amp; item counts</h2>
          <p className="admin-section-lede">Each row is one saved room — items are placements in that room.</p>
          <div className="admin-table-wrap admin-table-wrap-tight">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Room</th>
                  <th scope="col" className="admin-num">
                    Items
                  </th>
                  <th scope="col">Owner</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="admin-loading-cell" colSpan={3}>
                      Loading room stats…
                    </td>
                  </tr>
                ) : rooms.length === 0 ? (
                  <tr>
                    <td className="admin-empty-inline" colSpan={3}>
                      No rooms.
                    </td>
                  </tr>
                ) : (
                  rooms.map((r) => (
                    <tr key={r.room_id}>
                      <td>{r.room_name}</td>
                      <td className="admin-num">
                        <span className="admin-badge admin-badge-rooms">{r.item_count}</span>
                      </td>
                      <td title={r.owner_user_id}>
                        <code className="admin-code">{shortenId(r.owner_user_id)}</code>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section" aria-label="Users">
          <h2 className="admin-section-title">Users across rooms</h2>
          <p className="admin-section-lede">
            Per account: number of saved rooms vs total placements across all those rooms.
          </p>
          <div className="admin-table-wrap admin-table-wrap-tight">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col" className="admin-num">
                    Rooms
                  </th>
                  <th scope="col" className="admin-num">
                    Placements
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="admin-loading-cell" colSpan={3}>
                      Loading user stats…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td className="admin-empty-inline" colSpan={3}>
                      No users with rooms yet.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.user_id}>
                      <td title={u.user_id}>
                        <code className="admin-code">{shortenId(u.user_id)}</code>
                      </td>
                      <td className="admin-num">{u.room_count}</td>
                      <td className="admin-num">{u.total_item_placements}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section" aria-label="Catalog inventory">
          <h2 className="admin-section-title">Catalog &amp; usage</h2>
          <p className="admin-section-lede admin-catalog-lede">
            <strong>Distinct rooms</strong> counts unique saved rooms that contain this kind (even if multiple copies
            exist). <strong>Placements</strong> counts every row in <code className="admin-code-inline">room_items</code>{' '}
            for that kind. Hover column headers for short definitions.
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">
                    <button
                      type="button"
                      className="admin-th-btn"
                      onClick={() => toggleColumn('label')}
                    >
                      Label <span aria-hidden>{sortArrow(sortColumn === 'label', sortDir)}</span>
                    </button>
                  </th>
                  <th scope="col">
                    <button
                      type="button"
                      className="admin-th-btn"
                      onClick={() => toggleColumn('kind')}
                    >
                      Kind <span aria-hidden>{sortArrow(sortColumn === 'kind', sortDir)}</span>
                    </button>
                  </th>
                  <th scope="col" className="admin-tags-cell">
                    <button
                      type="button"
                      className="admin-th-btn"
                      onClick={() => toggleColumn('tags_joined')}
                    >
                      Tags <span aria-hidden>{sortArrow(sortColumn === 'tags_joined', sortDir)}</span>
                    </button>
                  </th>
                  <th scope="col" className="admin-desc-head">
                    <button
                      type="button"
                      className="admin-th-btn admin-th-btn-desc"
                      onClick={() => toggleColumn('description')}
                    >
                      Description <span aria-hidden>{sortArrow(sortColumn === 'description', sortDir)}</span>
                    </button>
                  </th>
                  <th scope="col" className="admin-num">
                    <button
                      type="button"
                      className="admin-th-btn admin-th-btn-num"
                      title="Number of distinct saved rooms that include ≥1 placement of this catalog kind"
                      onClick={() => toggleColumn('distinct_room_count')}
                    >
                      Distinct rooms <span aria-hidden>{sortArrow(sortColumn === 'distinct_room_count', sortDir)}</span>
                    </button>
                  </th>
                  <th scope="col" className="admin-num">
                    <button
                      type="button"
                      className="admin-th-btn admin-th-btn-num"
                      title="Total placements: count of room_items rows for this kind"
                      onClick={() => toggleColumn('in_room_count')}
                    >
                      Placements <span aria-hidden>{sortArrow(sortColumn === 'in_room_count', sortDir)}</span>
                    </button>
                  </th>
                  <th scope="col" className="admin-num">
                    <button
                      type="button"
                      className="admin-th-btn admin-th-btn-num"
                      onClick={() => toggleColumn('likes_count')}
                    >
                      Likes <span aria-hidden>{sortArrow(sortColumn === 'likes_count', sortDir)}</span>
                    </button>
                  </th>
                  <th scope="col" className="admin-num">
                    <button
                      type="button"
                      className="admin-th-btn admin-th-btn-num"
                      onClick={() => toggleColumn('downloads_count')}
                    >
                      Dl <span aria-hidden>{sortArrow(sortColumn === 'downloads_count', sortDir)}</span>
                    </button>
                  </th>
                  <th scope="col" className="admin-num">
                    <button
                      type="button"
                      className="admin-th-btn admin-th-btn-num"
                      onClick={() => toggleColumn('views_count')}
                    >
                      Views <span aria-hidden>{sortArrow(sortColumn === 'views_count', sortDir)}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="admin-loading-cell" colSpan={INV_COL_COUNT}>
                      Loading stats…
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => {
                    const tagsLine = ellipsize(row.tags.filter(Boolean).join(', '), 96);
                    const idle =
                      row.distinct_room_count === 0 &&
                      row.in_room_count === 0 &&
                      row.likes_count === 0 &&
                      row.downloads_count === 0 &&
                      row.views_count === 0;
                    return (
                      <tr key={row.kind} className={idle ? 'admin-row-muted' : undefined}>
                        <td>{row.label}</td>
                        <td>
                          <code className="admin-code">{row.kind}</code>
                        </td>
                        <td className="admin-tags-cell" title={row.tags.join(', ') || undefined}>
                          {tagsLine || <span className="admin-muted-dash">—</span>}
                        </td>
                        <td className="admin-desc-cell" title={row.description ?? undefined}>
                          {row.description?.trim()
                            ? ellipsize(row.description.trim(), 120)
                            : <span className="admin-muted-dash">—</span>}
                        </td>
                        <td className="admin-num">
                          <span className="admin-badge admin-badge-rooms">{row.distinct_room_count}</span>
                        </td>
                        <td className="admin-num">
                          <span className="admin-badge admin-badge-placements">{row.in_room_count}</span>
                        </td>
                        <td className="admin-num">
                          <span className="admin-badge admin-badge-likes">{row.likes_count}</span>
                        </td>
                        <td className="admin-num">
                          <span className="admin-badge admin-badge-downloads">{row.downloads_count}</span>
                        </td>
                        <td className="admin-num">
                          <span className="admin-badge admin-badge-recents">{row.views_count}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            {!loading && sortedRows.length === 0 ? (
              <p className="admin-empty">No catalog rows returned.</p>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
