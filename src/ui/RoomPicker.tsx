import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { IntroBackButton } from './IntroBackButton';

const MAX_ROOMS = 5;

export interface ListedRoomRow {
  id: string;
  name: string;
  updated_at: string;
  sort_order: number;
}

function nextRoomName(rooms: ListedRoomRow[]): string {
  const taken = new Set(rooms.map((r) => r.name));
  let n = 1;
  while (taken.has(`Room ${n}`)) n++;
  return `Room ${n}`;
}

interface RoomPickerProps {
  user: User;
  loadingLayout: boolean;
  onPickExisting: (room: { id: string; name: string }) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onBack?: () => void;
}

export function RoomPicker({
  user,
  loadingLayout,
  onPickExisting,
  onCreate,
  onBack,
}: RoomPickerProps) {
  const [rooms, setRooms] = useState<ListedRoomRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  const fetchRooms = useCallback(async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('id,name,updated_at,sort_order')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true });

    if (error) {
      setListError(error.message);
      return;
    }
    setRooms((data ?? []) as ListedRoomRow[]);
    setListError(null);
  }, [user.id]);

  useEffect(() => {
    void fetchRooms();
  }, [fetchRooms]);

  const atLimit = rooms.length >= MAX_ROOMS;

  async function openRoom(room: { id: string; name: string }) {
    try {
      setActionError(null);
      await onPickExisting(room);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not open room');
    }
  }

  function handleRowKeyDown(e: KeyboardEvent, room: ListedRoomRow) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    void openRoom({ id: room.id, name: room.name });
  }

  function handleOpenDeleteConfirm(e: MouseEvent, room: ListedRoomRow) {
    e.stopPropagation();
    setActionError(null);
    setConfirmDelete({ id: room.id, name: room.name });
  }

  async function handleConfirmedDelete() {
    if (!confirmDelete) return;
    setActionError(null);
    const target = confirmDelete;
    setConfirmDelete(null);
    setDeletingId(target.id);
    try {
      const { error } = await supabase.from('rooms').delete().eq('id', target.id);
      if (error) setActionError(error.message);
      if (editingId === target.id) {
        setEditingId(null);
        setEditName('');
      }
    } finally {
      setDeletingId(null);
      await fetchRooms();
    }
  }

  function handleStartEdit(e: MouseEvent, room: ListedRoomRow) {
    e.stopPropagation();
    setActionError(null);
    setEditingId(room.id);
    setEditName(room.name);
  }

  async function handleSaveEdit(e: FormEvent, roomId: string) {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = editName.trim();
    if (!trimmed) return;
    setActionError(null);
    const { error } = await supabase.from('rooms').update({ name: trimmed }).eq('id', roomId);
    if (error) {
      setActionError(error.message);
      return;
    }
    setEditingId(null);
    setEditName('');
    await fetchRooms();
  }

  function handleCancelEdit(e: MouseEvent) {
    e.stopPropagation();
    setEditingId(null);
    setEditName('');
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    if (rooms.length >= MAX_ROOMS) {
      setActionError(`Room limit reached (${MAX_ROOMS} rooms). Delete a room to create a new one.`);
      return;
    }
    const name = nextRoomName(rooms);
    setCreating(true);
    try {
      await onCreate(name);
      await fetchRooms();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not create room');
    } finally {
      setCreating(false);
    }
  }

  const actionsLocked =
    loadingLayout || deletingId !== null || editingId !== null || confirmDelete !== null;

  return (
    <div className="onboarding-page room-picker-page">
      <IntroBackButton onBack={onBack} />
      <header className="onboarding-header">
        <img src={`${import.meta.env.BASE_URL}toova-logo-cropped.png`} alt="Toova" className="onboarding-logo-img" />
      </header>
      <main className="onboarding-main">
        <div className="onboarding-card">
          <h1 className="onboarding-title onboarding-text-center">Choose a room</h1>
          <p className="onboarding-lede onboarding-text-center">
            Continue an existing layout or create a new room. You can switch rooms later from the planner.
          </p>

          {listError ? (
            <div className="onboarding-error-banner" role="alert">{listError}</div>
          ) : null}
          {actionError ? (
            <div className="onboarding-error-banner" role="alert">{actionError}</div>
          ) : null}

          <div className="onboarding-room-list">
            {rooms.length === 0 && !listError ? (
              <p className="onboarding-room-empty">No saved rooms yet. Create one below.</p>
            ) : (
              rooms.map((r) => {
                const isEditing = editingId === r.id;
                const rowBusy = loadingLayout || deletingId === r.id;

                return (
                  <div
                    key={r.id}
                    className={`onboarding-room-row${isEditing ? ' onboarding-room-row--editing' : ''}${rowBusy ? ' onboarding-room-row--disabled' : ''}`}
                    role={isEditing ? undefined : 'button'}
                    tabIndex={isEditing ? undefined : rowBusy ? -1 : 0}
                    onClick={
                      isEditing || rowBusy
                        ? undefined
                        : () => void openRoom({ id: r.id, name: r.name })
                    }
                    onKeyDown={
                      isEditing || rowBusy ? undefined : (e) => handleRowKeyDown(e, r)
                    }
                  >
                    {isEditing ? (
                      <form
                        className="onboarding-room-edit-form"
                        onSubmit={(e) => void handleSaveEdit(e, r.id)}
                      >
                        <input
                          id={`room-edit-${r.id}`}
                          className="onboarding-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                        />
                        <button type="submit" className="onboarding-room-edit-btn" disabled={loadingLayout}>
                          Save
                        </button>
                        <button
                          type="button"
                          className="onboarding-room-edit-btn secondary"
                          disabled={loadingLayout}
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="onboarding-room-row-main">
                          <span className="onboarding-room-name">{r.name}</span>
                        </div>
                        <div className="onboarding-room-row-tail">
                          <span className="onboarding-room-meta">
                            {new Date(r.updated_at).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </span>
                          <div className="onboarding-room-actions">
                            <button
                              type="button"
                              className="onboarding-room-action-btn"
                              aria-label="Rename room"
                              disabled={actionsLocked}
                              onClick={(e) => handleStartEdit(e, r)}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              className="onboarding-room-action-btn delete"
                              aria-label="Delete room"
                              disabled={actionsLocked}
                              onClick={(e) => handleOpenDeleteConfirm(e, r)}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <form className="onboarding-create-form" onSubmit={(e) => void handleCreate(e)}>
            {atLimit ? (
              <p className="onboarding-room-limit">Room limit reached ({MAX_ROOMS} / {MAX_ROOMS})</p>
            ) : null}
            <button
              type="submit"
              className="onboarding-btn onboarding-btn-primary"
              disabled={creating || loadingLayout || atLimit}
            >
              {creating ? 'Creating…' : '+ New Room'}
            </button>
          </form>
        </div>
      </main>

      {confirmDelete ? (
        <div
          className="onboarding-confirm-backdrop"
          role="presentation"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="onboarding-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="room-confirm-title" className="onboarding-confirm-text">
              Are you sure you want to delete <strong>{confirmDelete.name}</strong>?
            </p>
            <div className="onboarding-confirm-actions">
              <button type="button" className="onboarding-btn onboarding-btn-primary" onClick={() => void handleConfirmedDelete()}>
                Yes
              </button>
              <button type="button" className="onboarding-btn" onClick={() => setConfirmDelete(null)}>
                No
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
