import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { CuratedProduct } from '../../lib/dormChecklist';
import { supabase } from '../../lib/supabase';
import {
  addProductToChecklistList,
  createCustomChecklistList,
  mergeChecklistLists,
  type UserChecklistListMeta,
} from '../../lib/userChecklistLists';
import { Button, MonoMeta, Spinner } from '../kit';
import { Modal } from '../kit/Modal';

interface AddToListModalProps {
  open: boolean;
  product: CuratedProduct | null;
  userId: string | null;
  activeRoomId: string | null;
  onClose: () => void;
  onRequestSignIn?: () => void;
  onAdded: (listId: string, syncedActiveRoom: boolean) => void;
}

export function AddToListModal({
  open,
  product,
  userId,
  activeRoomId,
  onClose,
  onRequestSignIn,
  onAdded,
}: AddToListModalProps) {
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const lists = useMemo(
    () => (userId ? mergeChecklistLists(userId, rooms) : []),
    [userId, rooms],
  );

  const loadRooms = useCallback(async () => {
    if (!userId) return;
    setLoadingRooms(true);
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('id,name')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setRooms((data ?? []) as Array<{ id: string; name: string }>);
    } catch {
      setRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open && userId) void loadRooms();
  }, [open, userId, loadRooms]);

  if (!open || !product) return null;

  const pickList = async (list: UserChecklistListMeta) => {
    if (!userId) {
      onRequestSignIn?.();
      return;
    }
    setPendingId(list.id);
    try {
      await addProductToChecklistList(userId, list, product.id, 1);
      const syncedActiveRoom = list.kind === 'room' && list.roomId === activeRoomId;
      onAdded(list.id, syncedActiveRoom);
      onClose();
    } finally {
      setPendingId(null);
    }
  };

  const handleCreate = async () => {
    if (!userId) {
      onRequestSignIn?.();
      return;
    }
    const name = newName.trim() || `${product.name} list`;
    setCreating(true);
    try {
      const list = createCustomChecklistList(userId, name);
      await addProductToChecklistList(userId, list, product.id, 1);
      onAdded(list.id, false);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add to checklist"
      meta={product.name}
      footer={
        <div className="add-to-list-modal__footer">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      {!userId ? (
        <p>
          Sign in to save items to room checklists and custom lists.{' '}
          {onRequestSignIn ? (
            <button type="button" className="shopping-lists-header-link" onClick={onRequestSignIn}>
              Sign in
            </button>
          ) : null}
        </p>
      ) : loadingRooms ? (
        <Spinner label="Loading your checklists…" />
      ) : (
        <>
          <p className="checklist-scroll-guide__lede" style={{ marginTop: 0 }}>
            Choose a room checklist or a custom list. You can manage lists anytime from Checklists in
            the app rail.
          </p>
          <ul className="add-to-list-modal__lists">
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  className="add-to-list-modal__row"
                  disabled={pendingId === list.id}
                  onClick={() => void pickList(list)}
                >
                  <span className="add-to-list-modal__name">{list.name}</span>
                  <MonoMeta size="xs" tone="subtle">
                    {list.kind === 'room' ? 'Room checklist' : 'Custom list'}
                    {list.roomId && list.roomId === activeRoomId ? ' · active room' : ''}
                  </MonoMeta>
                </button>
              </li>
            ))}
          </ul>
          <div className="add-to-list-modal__create" style={{ marginTop: 16 }}>
            <label className="kit-field-label" htmlFor="add-to-list-new-name">
              New custom checklist
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <input
                id="add-to-list-new-name"
                className="shopping-lists-items__qty"
                style={{ flex: '1 1 180px', width: 'auto' }}
                placeholder="e.g. Dorm backup list"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Button size="sm" disabled={creating} onClick={() => void handleCreate()}>
                {creating ? 'Creating…' : 'Create & add'}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
