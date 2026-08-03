import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type MouseEvent,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { parseFloorPlan, type FloorPlan } from '../lib/roomGeometry';
import {
  formatRelativeTime,
  profileDisplayName,
  profileFirstName,
} from '../lib/userDisplay';
import { FeedbackModal } from './FeedbackModal';
import { RoomPreview, type RoomPreviewItem } from './RoomPreview';
import { listSharedWithMeRooms, type PublicAttribution, type ShareRole } from '../lib/roomShares';
import { fetchRoomAttribution, setRoomVisibility } from '../lib/profiles';
import { navigate, profilePath } from '../hooks/useRoute';
import { UserAvatar } from './UserAvatar';
import type { Profile } from '../lib/profiles';

const MAX_ROOMS = 5;

const ROOM_TYPES = ['Living Room', 'Bedroom', 'Office', 'Dining', 'Studio'];

const KNOWN_KINDS = new Set([
  'bed',
  'dresser',
  'wardrobe',
  'desk',
  'chair',
  'nightstand',
  'imported',
]);

function n(v: string | number): number {
  return typeof v === 'number' ? v : Number(v);
}

interface RoomItemPreviewRow {
  id: string;
  room_id: string;
  kind: string;
  pos_x: string | number;
  pos_y: string | number;
  pos_z: string | number;
  rotation_y: string | number;
  size_w: string | number;
  size_h: string | number;
  size_d: string | number;
}

function rowToPreviewItem(row: RoomItemPreviewRow): RoomPreviewItem | null {
  if (!KNOWN_KINDS.has(row.kind)) return null;
  return {
    id: row.id,
    kind: row.kind,
    position: [n(row.pos_x), n(row.pos_y), n(row.pos_z)],
    rotationY: n(row.rotation_y),
    size: [n(row.size_w), n(row.size_h), n(row.size_d)],
  };
}

export interface ListedRoomRow {
  id: string;
  name: string;
  updated_at: string;
  sort_order: number;
  item_count: number;
  geometry: FloorPlan | null;
  items: RoomPreviewItem[];
  visibility: 'private' | 'unlisted' | 'public';
  fork_count: number;
  forked_from: string | null;
  attribution: PublicAttribution | null;
}

function nextRoomName(rooms: ListedRoomRow[]): string {
  const taken = new Set(rooms.map((r) => r.name));
  let n = 1;
  while (taken.has(`Room ${n}`)) n++;
  return `Room ${n}`;
}

interface DashboardProps {
  user: User;
  profile: Profile | null;
  avatarUrl: string | null;
  loadingLayout: boolean;
  onPickExisting: (room: { id: string; name: string; isOwner?: boolean }) => Promise<void>;
  onStartFloorPlan: (name: string) => void;
  onGoLanding: () => void;
}

export function Dashboard({
  user,
  profile,
  avatarUrl,
  loadingLayout,
  onPickExisting,
  onStartFloorPlan,
  onGoLanding,
}: DashboardProps) {
  const [rooms, setRooms] = useState<ListedRoomRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuRoomId, setMenuRoomId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState('Living Room');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [sharedWithMe, setSharedWithMe] = useState<
    Array<{ id: string; name: string; updated_at: string; role: ShareRole }>
  >([]);

  const fetchRooms = useCallback(async () => {
    const { data: roomRows, error } = await supabase
      .from('rooms')
      .select('id,name,updated_at,sort_order,room_geometry,visibility,fork_count,forked_from')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true });

    if (error) {
      setListError(error.message);
      return;
    }

    const base = (roomRows ?? []) as Array<{
      id: string;
      name: string;
      updated_at: string;
      sort_order: number;
      room_geometry: unknown;
      visibility: 'private' | 'unlisted' | 'public';
      fork_count: number;
      forked_from: string | null;
    }>;

    const roomIds = base.map((r) => r.id);
    const itemsByRoom = new Map<string, RoomPreviewItem[]>();
    const attributionByRoom = new Map<string, PublicAttribution | null>();

    if (roomIds.length > 0) {
      const { data: itemRows, error: itemsErr } = await supabase
        .from('room_items')
        .select('id, room_id, kind, pos_x, pos_y, pos_z, rotation_y, size_w, size_h, size_d')
        .in('room_id', roomIds);

      if (itemsErr) {
        setListError(itemsErr.message);
        return;
      }

      for (const row of (itemRows ?? []) as RoomItemPreviewRow[]) {
        const item = rowToPreviewItem(row);
        if (!item) continue;
        const list = itemsByRoom.get(row.room_id) ?? [];
        list.push(item);
        itemsByRoom.set(row.room_id, list);
      }

      await Promise.all(
        base
          .filter((r) => r.forked_from)
          .map(async (r) => {
            try {
              const meta = await fetchRoomAttribution(r.id);
              attributionByRoom.set(r.id, meta?.attribution ?? null);
            } catch {
              attributionByRoom.set(r.id, null);
            }
          }),
      );
    }

    const withPreviews: ListedRoomRow[] = base.map((r) => {
      const items = itemsByRoom.get(r.id) ?? [];
      return {
        id: r.id,
        name: r.name,
        updated_at: r.updated_at,
        sort_order: r.sort_order,
        geometry: parseFloorPlan(r.room_geometry),
        items,
        item_count: items.length,
        visibility: r.visibility ?? 'private',
        fork_count: Number(r.fork_count ?? 0),
        forked_from: r.forked_from,
        attribution: attributionByRoom.get(r.id) ?? null,
      };
    });

    setRooms(withPreviews);
    setListError(null);
  }, [user.id]);

  const fetchSharedWithMe = useCallback(async () => {
    try {
      const rows = await listSharedWithMeRooms(user.id);
      setSharedWithMe(rows);
    } catch {
      setSharedWithMe([]);
    }
  }, [user.id]);

  useEffect(() => {
    void fetchRooms();
    void fetchSharedWithMe();
  }, [fetchRooms, fetchSharedWithMe]);

  const totalPlacements = rooms.reduce((s, r) => s + r.item_count, 0);
  const atLimit = rooms.length >= MAX_ROOMS;

  async function openRoom(room: { id: string; name: string; isOwner?: boolean }) {
    setMenuRoomId(null);
    setActionError(null);
    try {
      await onPickExisting(room);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not open room');
    }
  }

  async function handleDuplicate(roomId: string, roomName: string) {
    if (atLimit) {
      setActionError(`Room limit reached (${MAX_ROOMS} rooms).`);
      return;
    }
    setMenuRoomId(null);
    setBusyId(roomId);
    setActionError(null);
    try {
      const copyName = `${roomName} (copy)`;
      const { data: sourceRoom, error: srcErr } = await supabase
        .from('rooms')
        .select('environment, room_geometry')
        .eq('id', roomId)
        .single();
      if (srcErr) throw new Error(srcErr.message);

      const { data: newRoom, error: createErr } = await supabase
        .from('rooms')
        .insert({
          user_id: user.id,
          name: copyName,
          environment: sourceRoom?.environment ?? null,
          room_geometry: sourceRoom?.room_geometry ?? null,
        })
        .select('id')
        .single();
      if (createErr) throw new Error(createErr.message);

      const { data: items, error: itemsErr } = await supabase
        .from('room_items')
        .select('*')
        .eq('room_id', roomId)
        .order('sort_order', { ascending: true });
      if (itemsErr) throw new Error(itemsErr.message);

      if (items && items.length > 0) {
        const payload = items.map((row, i) => {
          const { id: _id, room_id: _rid, ...rest } = row as Record<string, unknown>;
          return { ...rest, room_id: newRoom.id, sort_order: i };
        });
        const { error: insErr } = await supabase.from('room_items').insert(payload);
        if (insErr) throw new Error(insErr.message);
      }

      await fetchRooms();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not duplicate room');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(roomId: string) {
    setConfirmDeleteId(null);
    setBusyId(roomId);
    setActionError(null);
    try {
      const { error } = await supabase.from('rooms').delete().eq('id', roomId);
      if (error) setActionError(error.message);
      if (renamingId === roomId) setRenamingId(null);
    } finally {
      setBusyId(null);
      await fetchRooms();
    }
  }

  async function handleSetVisibility(roomId: string, visibility: 'private' | 'public') {
    setMenuRoomId(null);
    setBusyId(roomId);
    setActionError(null);
    try {
      await setRoomVisibility(roomId, visibility);
      await fetchRooms();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update visibility');
    } finally {
      setBusyId(null);
    }
  }

  async function commitRename(roomId: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setActionError(null);
    const { error } = await supabase.from('rooms').update({ name: trimmed }).eq('id', roomId);
    if (error) {
      setActionError(error.message);
      return;
    }
    setRenamingId(null);
    setRenameValue('');
    await fetchRooms();
  }

  function handleCreateRoom() {
    const name = newRoomName.trim() || nextRoomName(rooms);
    if (atLimit) {
      setActionError(`Room limit reached (${MAX_ROOMS} rooms).`);
      return;
    }
    setActionError(null);
    setShowNewRoom(false);
    setNewRoomName('');
    onStartFloorPlan(name);
  }

  function toggleMenu(e: MouseEvent, roomId: string) {
    e.stopPropagation();
    setMenuRoomId((prev) => (prev === roomId ? null : roomId));
  }

  return (
    <div className="dashboard-page tv-scroll">
      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        pageSource="dashboard"
        defaultEmail={user.email ?? ''}
        userId={user.id}
      />
      <div className="dashboard-topbar">
        <div className="dashboard-topbar-inner">
          <button type="button" onClick={onGoLanding} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
            <div className="tv-logo-mark" style={{ width: 25, height: 25, borderRadius: 7, fontSize: 17 }}>t</div>
            <span className="tv-logo-text" style={{ fontSize: 22 }}>Toova</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <button type="button" className="feedback-btn-ghost" onClick={() => setFeedbackOpen(true)}>
              Feedback
            </button>
            <button
              type="button"
              className="dashboard-profile-chip"
              onClick={() => {
                if (profile?.handle) navigate(profilePath(profile.handle));
              }}
              disabled={!profile?.handle}
              title={profile?.handle ? `Open @${profile.handle}` : 'Profile loading…'}
            >
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{profileDisplayName(profile, user.email)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                  {profile?.handle ? `@${profile.handle}` : 'Free plan'}
                </div>
              </div>
              <UserAvatar name={profileDisplayName(profile, user.email)} src={avatarUrl} size={36} />
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-main">
        <div className="dashboard-header">
          <div>
            <div className="dashboard-kicker">Welcome back, {profileFirstName(profile, user.email)}</div>
            <h1 className="dashboard-title">Your rooms</h1>
          </div>
          <button
            type="button"
            className="tv-btn-primary"
            style={{ fontSize: 14, padding: '12px 20px', borderRadius: 11, display: 'flex', alignItems: 'center', gap: 8 }}
            onClick={() => { setShowNewRoom(true); setNewRoomName(''); }}
            disabled={atLimit}
          >
            <span style={{ fontSize: 17, lineHeight: 1 }}>+</span> New room
          </button>
        </div>

        <div className="dashboard-meta">{rooms.length} saved · {totalPlacements} pieces placed</div>

        {listError ? <div className="tv-banner-error" role="alert">{listError}</div> : null}
        {actionError ? <div className="tv-banner-error" role="alert">{actionError}</div> : null}

        {rooms.length === 0 && !listError ? (
          <div className="dashboard-empty">
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--text)', marginBottom: 8 }}>No rooms yet</div>
            <div style={{ fontSize: 15, marginBottom: 20 }}>Create your first room and start placing furniture.</div>
            <button type="button" className="tv-btn-primary" style={{ fontSize: 14, padding: '12px 22px', borderRadius: 10 }} onClick={() => setShowNewRoom(true)}>+ New room</button>
          </div>
        ) : (
          <div className="dashboard-grid">
            {rooms.map((r) => {
              const isRenaming = renamingId === r.id;
              const menuOpen = menuRoomId === r.id;
              const isBusy = busyId === r.id || loadingLayout;

              return (
                <div key={r.id} className={`dashboard-room-card${menuOpen ? ' dashboard-room-card--menu-open' : ''}`}>
                  <div className="dashboard-room-preview">
                    <RoomPreview geometry={r.geometry} items={r.items} />
                    <span className={`profile-vis-badge profile-vis-badge--${r.visibility}`}>
                      {r.visibility}
                    </span>
                  </div>
                  <div className="dashboard-room-body">
                    {isRenaming ? (
                      <>
                        <input
                          className="tv-input"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename(r.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          autoFocus
                          style={{ fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 500, marginBottom: 8 }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="tv-btn-primary" style={{ flex: 1, padding: 8, borderRadius: 8, fontSize: 13 }} onClick={() => void commitRename(r.id)}>Save</button>
                          <button type="button" style={{ flex: 1, cursor: 'pointer', border: '1px solid var(--border-input)', background: '#fff', color: 'var(--text-dark)', fontFamily: 'inherit', fontSize: 13, padding: 8, borderRadius: 8 }} onClick={() => setRenamingId(null)}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 500, letterSpacing: '-.01em', lineHeight: 1.15 }}>{r.name}</div>
                            <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 3 }}>
                              {r.item_count} pieces · {formatRelativeTime(r.updated_at)}
                              {r.fork_count > 0 ? ` · ${r.fork_count} copies` : ''}
                            </div>
                            {r.attribution?.visible ? (
                              <div className="room-attribution">
                                Forked from {r.attribution.room_name} by {r.attribution.owner_display}
                              </div>
                            ) : r.forked_from ? (
                              <div className="room-attribution">Copied room</div>
                            ) : null}
                          </div>
                          <div style={{ position: 'relative' }}>
                            <button type="button" onClick={(e) => toggleMenu(e, r.id)} style={{ cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-muted)', width: 30, height: 30, borderRadius: 8, fontSize: 15, lineHeight: 1 }}>⋯</button>
                            {menuOpen ? (
                              <div style={{ position: 'absolute', right: 0, top: 36, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 14px 30px -12px rgba(43,38,32,.35)', padding: 5, width: 150 }}>
                                <button type="button" style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 14, padding: '9px 11px', borderRadius: 7, cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit' }} onClick={() => void openRoom({ id: r.id, name: r.name })}>Open &amp; design</button>
                                <button type="button" style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 14, padding: '9px 11px', borderRadius: 7, cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit' }} onClick={() => { setRenamingId(r.id); setRenameValue(r.name); setMenuRoomId(null); }}>Rename</button>
                                <button type="button" style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 14, padding: '9px 11px', borderRadius: 7, cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit' }} onClick={() => void handleDuplicate(r.id, r.name)} disabled={atLimit}>Duplicate</button>
                                {r.visibility === 'public' ? (
                                  <button type="button" style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 14, padding: '9px 11px', borderRadius: 7, cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit' }} onClick={() => void handleSetVisibility(r.id, 'private')}>Remove from profile</button>
                                ) : (
                                  <button type="button" style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 14, padding: '9px 11px', borderRadius: 7, cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit' }} onClick={() => void handleSetVisibility(r.id, 'public')}>Publish to profile</button>
                                )}
                                <button type="button" style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 14, padding: '9px 11px', borderRadius: 7, cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit', color: 'var(--danger)' }} onClick={() => { setConfirmDeleteId(r.id); setMenuRoomId(null); }}>Delete</button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void openRoom({ id: r.id, name: r.name })}
                          style={{ width: '100%', marginTop: 13, cursor: 'pointer', border: '1px solid var(--accent-line)', background: 'var(--accent-bg)', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, padding: 11, borderRadius: 10 }}
                        >
                          Open &amp; design →
                        </button>
                      </>
                    )}
                  </div>

                  {confirmDeleteId === r.id ? (
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 16, background: 'rgba(43,38,32,.8)', backdropFilter: 'blur(2px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: '#F8F3EA', marginBottom: 6 }}>Delete this room?</div>
                      <div style={{ fontSize: 13, color: 'rgba(244,238,228,.7)', marginBottom: 18 }}>&quot;{r.name}&quot; can&apos;t be recovered.</div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button type="button" style={{ cursor: 'pointer', border: 'none', background: 'var(--danger)', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 8 }} onClick={() => void handleDelete(r.id)}>Delete</button>
                        <button type="button" style={{ cursor: 'pointer', border: '1px solid rgba(244,238,228,.3)', background: 'transparent', color: '#F8F3EA', fontFamily: 'inherit', fontSize: 13, padding: '10px 18px', borderRadius: 8 }} onClick={() => setConfirmDeleteId(null)}>Keep</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {sharedWithMe.length > 0 ? (
          <div className="dashboard-shared-section">
            <h2 className="dashboard-shared-title">Shared with me</h2>
            <p className="dashboard-shared-lead">Rooms you can edit via a share link.</p>
            <div className="dashboard-grid">
              {sharedWithMe.map((r) => (
                <div key={r.id} className="dashboard-room-card">
                  <div className="dashboard-room-body" style={{ paddingTop: 18 }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 500 }}>
                      {r.name}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 3 }}>
                      {r.role} · {formatRelativeTime(r.updated_at)}
                    </div>
                    <button
                      type="button"
                      disabled={loadingLayout}
                      onClick={() => void openRoom({ id: r.id, name: r.name, isOwner: false })}
                      style={{
                        width: '100%',
                        marginTop: 13,
                        cursor: 'pointer',
                        border: '1px solid var(--accent-line)',
                        background: 'var(--accent-bg)',
                        color: 'var(--accent)',
                        fontFamily: 'inherit',
                        fontSize: 14,
                        fontWeight: 600,
                        padding: 11,
                        borderRadius: 10,
                      }}
                    >
                      Open &amp; edit →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {showNewRoom ? (
        <div className="dashboard-modal-backdrop" role="presentation" onClick={() => setShowNewRoom(false)}>
          <div className="dashboard-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26, margin: '0 0 4px' }}>New room</h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 22px' }}>Name it and pick a room type to start.</p>
            <label className="tv-label">Room name</label>
            <input className="tv-input" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="e.g. Sunlit Living Room" style={{ marginBottom: 18 }} />
            <label className="tv-label">Room type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 26 }}>
              {ROOM_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewRoomType(t)}
                  style={{
                    cursor: 'pointer',
                    padding: '7px 14px',
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    border: newRoomType === t ? '1px solid var(--accent-line)' : '1px solid var(--border)',
                    background: newRoomType === t ? 'var(--accent-bg)' : '#fff',
                    color: newRoomType === t ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="tv-btn-primary" style={{ flex: 1, padding: 13, borderRadius: 10, fontSize: 15 }} onClick={handleCreateRoom}>
                Draw floor plan
              </button>
              <button type="button" style={{ cursor: 'pointer', border: '1px solid var(--border-input)', background: '#fff', color: 'var(--text-dark)', fontFamily: 'inherit', fontSize: 15, padding: '13px 20px', borderRadius: 10 }} onClick={() => setShowNewRoom(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
