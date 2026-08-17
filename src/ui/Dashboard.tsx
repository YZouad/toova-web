import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { parseFloorPlan, planBounds, type FloorPlan } from '../lib/roomGeometry';
import {
  formatRelativeTime,
  profileInitials,
} from '../lib/userDisplay';
import { FeedbackModal } from './FeedbackModal';
import { RoomPreview, type RoomPreviewItem } from './RoomPreview';
import { listSharedWithMeRooms, type PublicAttribution, type ShareRole } from '../lib/roomShares';
import { fetchRoomAttribution, setRoomVisibility } from '../lib/profiles';
import { navigate, profilePath } from '../hooks/useRoute';
import type { Profile } from '../lib/profiles';
import { resolvePreviewTintsForModelUrls } from '../lib/previewTintColor';
import {
  AppShell,
  type AppShellNavId,
  Badge,
  Banner,
  Button,
  EmptyState,
  Input,
  Modal,
  MonoMeta,
  Plate,
  SectionOpener,
  Tabs,
} from './kit';

const MAX_ROOMS = 5;

const KNOWN_KINDS = new Set([
  'bed',
  'dresser',
  'wardrobe',
  'desk',
  'chair',
  'nightstand',
  'lamp',
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
  model_url?: string | null;
}

function rowToPreviewItem(row: RoomItemPreviewRow): RoomPreviewItem | null {
  if (!KNOWN_KINDS.has(row.kind)) return null;
  const modelUrl =
    row.kind === 'imported' ? String(row.model_url ?? '').trim() || null : null;
  return {
    id: row.id,
    kind: row.kind,
    position: [n(row.pos_x), n(row.pos_y), n(row.pos_z)],
    rotationY: n(row.rotation_y),
    size: [n(row.size_w), n(row.size_h), n(row.size_d)],
    modelUrl,
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
  let i = 1;
  while (taken.has(`Room ${i}`)) i++;
  return `Room ${i}`;
}

function roomFilename(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`;
}

function formatSqft(geometry: FloorPlan | null): string {
  if (!geometry) return '—';
  const b = planBounds(geometry);
  const sqft = Math.round((b.width * b.depth) / 144);
  return sqft > 0 ? `${sqft} sq ft` : '—';
}

function visibilityLabel(v: 'private' | 'unlisted' | 'public'): string {
  if (v === 'public') return 'Public';
  if (v === 'unlisted') return 'Unlisted';
  return 'Private';
}

function visibilityBadgeTone(v: 'private' | 'unlisted' | 'public'): 'accent' | 'neutral' {
  return v === 'public' ? 'accent' : 'neutral';
}

interface DashboardProps {
  user: User;
  profile: Profile | null;
  avatarUrl: string | null;
  loadingLayout: boolean;
  showAdmin?: boolean;
  onPickExisting: (room: { id: string; name: string; isOwner?: boolean }) => Promise<void>;
  /** Opens the combined name + starter layout picker. Passes a suggested default name. */
  onStartFloorPlan: (suggestedName: string) => void;
  onNavigate: (nav: AppShellNavId) => void;
  onLogout: () => void;
  onContact?: () => void;
  onPitchMadness?: () => void;
}

export function Dashboard({
  user,
  profile,
  loadingLayout,
  showAdmin,
  onPickExisting,
  onStartFloorPlan,
  onNavigate,
  onLogout,
  onContact,
  onPitchMadness,
}: DashboardProps) {
  const [rooms, setRooms] = useState<ListedRoomRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuRoomId, setMenuRoomId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [sharedWithMe, setSharedWithMe] = useState<
    Array<{ id: string; name: string; updated_at: string; role: ShareRole }>
  >([]);
  const [tab, setTab] = useState<'mine' | 'shared' | 'forks'>('mine');

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
        .select('id, room_id, kind, pos_x, pos_y, pos_z, rotation_y, size_w, size_h, size_d, model_url')
        .in('room_id', roomIds);

      if (itemsErr) {
        setListError(itemsErr.message);
        return;
      }

      const previewRows = (itemRows ?? []) as RoomItemPreviewRow[];
      for (const row of previewRows) {
        const item = rowToPreviewItem(row);
        if (!item) continue;
        const list = itemsByRoom.get(row.room_id) ?? [];
        list.push(item);
        itemsByRoom.set(row.room_id, list);
      }

      const modelUrls = [
        ...new Set(
          previewRows
            .filter((r) => r.kind === 'imported')
            .map((r) => String(r.model_url ?? '').trim())
            .filter(Boolean),
        ),
      ];
      if (modelUrls.length > 0) {
        try {
          const tints = await resolvePreviewTintsForModelUrls(modelUrls);
          for (const [roomId, list] of itemsByRoom) {
            itemsByRoom.set(
              roomId,
              list.map((it) => {
                if (it.kind !== 'imported' || !it.modelUrl) return it;
                const tint = tints.get(it.modelUrl);
                return tint ? { ...it, tint } : it;
              }),
            );
          }
        } catch {
          /* tints are best-effort */
        }
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
  const forkRooms = rooms.filter((r) => r.forked_from);
  const hasSharedTab = sharedWithMe.length > 0;
  const hasForksTab = forkRooms.length > 0;

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

  function handleNewRoom() {
    if (atLimit) {
      setActionError(`Room limit reached (${MAX_ROOMS} rooms).`);
      return;
    }
    setActionError(null);
    onStartFloorPlan(nextRoomName(rooms));
  }

  function toggleMenu(e: MouseEvent, roomId: string) {
    e.stopPropagation();
    setMenuRoomId((prev) => (prev === roomId ? null : roomId));
  }

  function renderRoomRow(room: ListedRoomRow, first: boolean) {
    const isRenaming = renamingId === room.id;
    const menuOpen = menuRoomId === room.id;
    const isBusy = busyId === room.id || loadingLayout;

    return (
      <div
        key={room.id}
        className={[
          'app-ledger-row',
          first ? 'app-ledger-row--first' : '',
          !isRenaming ? 'app-ledger-row--interactive' : '',
          menuOpen ? 'app-ledger-row--menu-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={!isRenaming ? () => void openRoom({ id: room.id, name: room.name }) : undefined}
        onKeyDown={
          !isRenaming
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void openRoom({ id: room.id, name: room.name });
                }
              }
            : undefined
        }
        role={!isRenaming ? 'button' : undefined}
        tabIndex={!isRenaming ? 0 : undefined}
      >
        <Plate height={84} topCaption={roomFilename(room.name)}>
          <div className="app-ledger-plate-preview">
            <RoomPreview geometry={room.geometry} items={room.items} />
          </div>
        </Plate>

        <div>
          {isRenaming ? (
            <>
              <input
                className="app-ledger-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') void commitRename(room.id);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Button size="sm" onClick={(e) => { e.stopPropagation(); void commitRename(room.id); }}>
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setRenamingId(null); }}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="app-ledger-name">{room.name}</div>
              <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginTop: 5 }}>
                edited {formatRelativeTime(room.updated_at)}
                {room.fork_count > 0 ? ` · ${room.fork_count} copies` : ''}
              </MonoMeta>
              {room.attribution?.visible ? (
                <div className="app-ledger-attribution">
                  Forked from {room.attribution.room_name} by {room.attribution.owner_display}
                </div>
              ) : room.forked_from ? (
                <div className="app-ledger-attribution">Copied room</div>
              ) : null}
            </>
          )}
        </div>

        <MonoMeta size="md" tone="default">{room.item_count} pieces</MonoMeta>
        <MonoMeta size="md" tone="default">{formatSqft(room.geometry)}</MonoMeta>
        <MonoMeta size="md" tone="default">—</MonoMeta>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, position: 'relative' }}>
          <Badge
            tone={visibilityBadgeTone(room.visibility)}
            dot={room.visibility === 'public'}
          >
            {visibilityLabel(room.visibility)}
          </Badge>
          <button
            type="button"
            className="app-ledger-menu-btn"
            onClick={(e) => toggleMenu(e, room.id)}
            aria-label="Room actions"
            disabled={isBusy}
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="app-ledger-menu" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="app-ledger-menu-item" onClick={() => void openRoom({ id: room.id, name: room.name })}>
                Open &amp; design
              </button>
              <button
                type="button"
                className="app-ledger-menu-item"
                onClick={() => {
                  setRenamingId(room.id);
                  setRenameValue(room.name);
                  setMenuRoomId(null);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="app-ledger-menu-item"
                onClick={() => void handleDuplicate(room.id, room.name)}
                disabled={atLimit}
              >
                Duplicate
              </button>
              {room.visibility === 'public' ? (
                <button type="button" className="app-ledger-menu-item" onClick={() => void handleSetVisibility(room.id, 'private')}>
                  Remove from profile
                </button>
              ) : (
                <button type="button" className="app-ledger-menu-item" onClick={() => void handleSetVisibility(room.id, 'public')}>
                  Publish to profile
                </button>
              )}
              <button
                type="button"
                className="app-ledger-menu-item app-ledger-menu-item--danger"
                onClick={() => {
                  setConfirmDeleteId(room.id);
                  setMenuRoomId(null);
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const deleteRoom = rooms.find((r) => r.id === confirmDeleteId);
  const ledgerRooms =
    tab === 'forks' ? forkRooms : tab === 'mine' ? rooms : [];

  return (
    <AppShell
      active="rooms"
      title="Rooms"
      meta={`${rooms.length} of ${MAX_ROOMS} used · free plan`}
      showAdmin={showAdmin}
      profileInitials={profileInitials(profile, user.email)}
      onNavigate={onNavigate}
      onLogout={onLogout}
      onContact={onContact}
      onPitchMadness={onPitchMadness}
      feedbackEmail={user.email ?? ''}
      feedbackUserId={user.id}
      onProfile={
        profile?.handle
          ? () => navigate(profilePath(profile.handle))
          : undefined
      }
      actions={
        <>
          <Button variant="mono" onClick={() => setFeedbackOpen(true)}>
            Feedback
          </Button>
          <Button size="sm" onClick={handleNewRoom} disabled={atLimit}>
            New room
          </Button>
        </>
      }
    >
      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        pageSource="dashboard"
        defaultEmail={user.email ?? ''}
        userId={user.id}
      />

      <SectionOpener
        level={5}
        title="Your rooms."
        note={`Free plan · ${rooms.length} of ${MAX_ROOMS} rooms${totalPlacements ? ` · ${totalPlacements} pieces placed` : ''}`}
      />

      <Tabs
        style={{ marginTop: 28 }}
        active={tab}
        onChange={(id) => setTab(id as 'mine' | 'shared' | 'forks')}
        tabs={[
          { id: 'mine', label: 'Mine', count: rooms.length },
          ...(hasSharedTab
            ? [{ id: 'shared', label: 'Shared with me', count: sharedWithMe.length }]
            : []),
          ...(hasForksTab
            ? [{ id: 'forks', label: 'Forks', count: forkRooms.length }]
            : []),
        ]}
      />

      {listError ? <Banner tone="error" style={{ marginTop: 20 }}>{listError}</Banner> : null}
      {actionError ? <Banner tone="error" style={{ marginTop: 20 }}>{actionError}</Banner> : null}

      {tab === 'shared' ? (
        <div style={{ marginTop: 28 }}>
          <div className="app-ledger-head app-ledger-head--shared">
            <span>Plan</span>
            <span>Room</span>
            <span>Role</span>
            <span>Updated</span>
            <span aria-hidden />
            <span aria-hidden />
          </div>
          {sharedWithMe.map((r, i) => (
            <div
              key={r.id}
              className={[
                'app-ledger-row',
                'app-ledger-row--shared',
                'app-ledger-row--interactive',
                i === 0 ? 'app-ledger-row--first' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => void openRoom({ id: r.id, name: r.name, isOwner: false })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void openRoom({ id: r.id, name: r.name, isOwner: false });
                }
              }}
            >
              <Plate height={84} topCaption={roomFilename(r.name)} />
              <div>
                <div className="app-ledger-name">{r.name}</div>
                <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginTop: 5 }}>
                  shared · {formatRelativeTime(r.updated_at)}
                </MonoMeta>
              </div>
              <MonoMeta size="md" tone="default">{r.role}</MonoMeta>
              <MonoMeta size="md" tone="default">{formatRelativeTime(r.updated_at)}</MonoMeta>
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : ledgerRooms.length === 0 && !listError ? (
        <EmptyState
          style={{ marginTop: 48 }}
          label={tab === 'forks' ? 'No forks' : 'No rooms yet'}
          title="Start with a room that fits your space."
          body="Choose a furnished template or draw your floor plan — every piece you place is measured against it."
          action={
            tab === 'mine' ? (
              <Button size="md" onClick={handleNewRoom}>
                New room
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div style={{ marginTop: 28 }}>
          <div className="app-ledger-head">
            <span>Plan</span>
            <span>Room</span>
            <span>Pieces</span>
            <span>Floor area</span>
            <span>Total</span>
            <span className="app-ledger-head__right">Visibility</span>
          </div>
          {ledgerRooms.map((r, i) => renderRoomRow(r, i === 0))}
        </div>
      )}

      {!atLimit && rooms.length > 0 && tab === 'mine' ? (
        <EmptyState
          style={{ marginTop: 72 }}
          label={`${MAX_ROOMS - rooms.length} room${MAX_ROOMS - rooms.length === 1 ? '' : 's'} left`}
          title="Start with a room that fits your space."
          body="Choose a furnished template or draw your floor plan — every piece you place is measured against it."
          action={
            <Button size="md" onClick={handleNewRoom}>
              New room
            </Button>
          }
        />
      ) : null}

      <Modal
        open={!!deleteRoom}
        meta="Delete room"
        title="Delete this room?"
        onClose={() => setConfirmDeleteId(null)}
        footer={
          <>
            <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
              Keep
            </Button>
            <Button
              size="sm"
              onClick={() => deleteRoom && void handleDelete(deleteRoom.id)}
              style={{ background: 'var(--danger)' }}
            >
              Delete
            </Button>
          </>
        }
      >
        {deleteRoom ? (
          <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--ink-4)' }}>
            &quot;{deleteRoom.name}&quot; can&apos;t be recovered.
          </p>
        ) : null}
      </Modal>
    </AppShell>
  );
}
