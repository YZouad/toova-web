import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { ensureShoppingListCacheVersion } from '../lib/dormChecklist';
import { useChecklistRoomScope } from '../context/ChecklistRoomContext';
import { useShoppingCatalogContext } from '../context/ShoppingCatalogContext';
import {
  migrateLocalCustomListsToAccount,
  pullRemoteCustomListsIntoLocal,
} from '../lib/customChecklistRemote';
import { formatPriceCents } from '../lib/dormChecklist';
import { supabase } from '../lib/supabase';
import {
  createCustomChecklistList,
  deleteCustomChecklistList,
  loadChecklistListItems,
  mergeChecklistLists,
  removeChecklistListItem,
  renameChecklistList,
  updateChecklistListItemQty,
  type UserChecklistListMeta,
} from '../lib/userChecklistLists';
import {
  AppShell,
  Button,
  MonoMeta,
  SectionOpener,
  Spinner,
  type AppShellNavId,
} from './kit';
import { ChecklistRoomLoadPanel } from './checklist/ChecklistRoomLoadPanel';

interface ShoppingListsPageProps {
  user: User;
  profile: { display_name?: string | null } | null;
  showAdmin?: boolean;
  onNavigate: (nav: AppShellNavId) => void;
  onLogout: () => void;
  onOpenRoom?: (roomId: string) => void;
  onOpenChecklist?: (opts?: { roomId?: string; listId?: string }) => void;
}

export function ShoppingListsPage({
  user,
  showAdmin,
  onNavigate,
  onLogout,
  onOpenRoom,
  onOpenChecklist,
}: ShoppingListsPageProps) {
  const { roomId: contextRoomId, setRoomId, setChecklistLoadMode } = useChecklistRoomScope();
  const {
    roomId: catalogRoomId,
    productsById,
    list: contextList,
    ready: catalogReady,
    refreshListFromStorage,
    loading: catalogLoading,
  } = useShoppingCatalogContext();

  const [lists, setLists] = useState<UserChecklistListMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customItems, setCustomItems] = useState<
    Array<{ productId: string; quantity: number; reviewDone: boolean }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [renameDraft, setRenameDraft] = useState('');
  const [creatingName, setCreatingName] = useState('');

  const selected = useMemo(
    () => lists.find((l) => l.id === selectedId) ?? null,
    [lists, selectedId],
  );

  const refreshRoomsAndLists = useCallback(async () => {
    ensureShoppingListCacheVersion();
    const { data, error } = await supabase
      .from('rooms')
      .select('id,name')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true });
    const roomRows = error ? [] : ((data ?? []) as Array<{ id: string; name: string }>);
    const merged = mergeChecklistLists(user.id, roomRows);
    setLists(merged);
    setSelectedId((prev) => prev ?? merged[0]?.id ?? null);
    return roomRows;
  }, [user.id]);

  const syncCustomListsInBackground = useCallback((roomRows: Array<{ id: string; name: string }>) => {
    void (async () => {
      try {
        await migrateLocalCustomListsToAccount(user.id);
        await pullRemoteCustomListsIntoLocal(user.id);
        setLists(mergeChecklistLists(user.id, roomRows));
      } catch (e) {
        console.warn('[toova] custom checklist sync', e);
      }
    })();
  }, [user.id]);

  useEffect(() => {
    setChecklistLoadMode('lists-only');
    return () => setChecklistLoadMode('full');
  }, [setChecklistLoadMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const roomRows = await refreshRoomsAndLists();
        if (!cancelled) syncCustomListsInBackground(roomRows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshRoomsAndLists, syncCustomListsInBackground]);

  useEffect(() => {
    if (!selected) return;
    setRenameDraft(selected.name);
    if (selected.kind === 'room' && selected.roomId) {
      if (selected.roomId !== contextRoomId) {
        setRoomId(selected.roomId);
      }
      return;
    }
    setCustomItems(loadChecklistListItems(selected));
  }, [selected, contextRoomId, setRoomId]);

  const roomItems = useMemo(() => {
    if (selected?.kind !== 'room' || !selected.roomId) return [];
    if (catalogRoomId === selected.roomId) return contextList;
    return loadChecklistListItems(selected);
  }, [selected, catalogRoomId, contextList]);

  const displayItems =
    selected?.kind === 'room' ? roomItems : customItems;

  const showItemsSpinner =
    selected?.kind === 'room' &&
    !!selected.roomId &&
    catalogRoomId === selected.roomId &&
    displayItems.length === 0 &&
    (!catalogReady || catalogLoading);

  const handleCreate = () => {
    const name = creatingName.trim() || 'Custom checklist';
    const list = createCustomChecklistList(user.id, name);
    setCreatingName('');
    void refreshRoomsAndLists().then((roomRows) => {
      syncCustomListsInBackground(roomRows);
      setSelectedId(list.id);
    });
  };

  const handleDelete = (list: UserChecklistListMeta) => {
    if (list.kind !== 'custom') return;
    if (!window.confirm(`Delete “${list.name}”?`)) return;
    deleteCustomChecklistList(user.id, list.id);
    void refreshRoomsAndLists().then(syncCustomListsInBackground);
    if (selectedId === list.id) setSelectedId(null);
  };

  const handleRename = (list: UserChecklistListMeta) => {
    if (list.kind !== 'custom') return;
    if (!renameChecklistList(user.id, list.id, renameDraft)) return;
    void refreshRoomsAndLists().then(syncCustomListsInBackground);
  };

  const afterListMutation = useCallback(
    async (list: UserChecklistListMeta) => {
      if (list.kind === 'room' && list.roomId && catalogRoomId === list.roomId) {
        await refreshListFromStorage();
        return;
      }
      if (list.kind === 'custom') {
        setCustomItems(loadChecklistListItems(list));
      }
    },
    [catalogRoomId, refreshListFromStorage],
  );

  const roomLists = lists.filter((l) => l.kind === 'room');
  const customLists = lists.filter((l) => l.kind === 'custom');

  return (
    <AppShell
      active="lists"
      title="Your checklists"
      meta={`${lists.length} saved`}
      showAdmin={showAdmin}
      profileInitials={user.email?.slice(0, 2).toUpperCase() ?? '??'}
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      <main className="app-main" style={{ paddingBottom: 80 }}>
        <SectionOpener
          level={3}
          title="Room and custom checklists."
          note="Add · edit · delete"
        />
        <p className="checklist-scroll-guide__lede">
          Every room you design has its own checklist. Custom lists are for extra shopping runs—dorm
          backup, shared suite gear, or anything else.
        </p>

        {loading ? <Spinner label="Loading checklists…" /> : null}

        {!loading && lists.length === 0 ? (
          <p className="checklist-item-section__empty">
            No checklists yet. Create a room from Rooms, or add a custom list below.
          </p>
        ) : null}

        {!loading ? (
          <div className="shopping-lists-layout">
            <ListIndexSidebar
              lists={roomLists}
              customLists={customLists}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />

            <div className="shopping-lists-detail">
              {selected ? (
                <>
                  <div className="shopping-lists-detail__head">
                    <h2 className="shopping-lists-detail__title">{selected.name}</h2>
                    <div className="shopping-lists-detail__actions">
                      {selected.kind === 'room' && selected.roomId && onOpenRoom ? (
                        <Button size="sm" variant="outline" onClick={() => onOpenRoom(selected.roomId!)}>
                          Open room
                        </Button>
                      ) : null}
                      {selected.kind === 'room' && selected.roomId && onOpenChecklist ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            onOpenChecklist({ roomId: selected.roomId!, listId: selected.id })
                          }
                        >
                          Toova checklist
                        </Button>
                      ) : null}
                      {selected.kind === 'custom' && onOpenChecklist ? (
                        <Button size="sm" onClick={() => onOpenChecklist({ listId: selected.id })}>
                          Toova checklist
                        </Button>
                      ) : null}
                      {selected.kind === 'custom' ? (
                        <>
                          <input
                            className="shopping-lists-items__qty"
                            style={{ width: 'min(220px, 100%)' }}
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            aria-label="Checklist name"
                          />
                          <Button size="sm" variant="outline" onClick={() => handleRename(selected)}>
                            Save name
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(selected)}
                            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                          >
                            Delete
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {showItemsSpinner ? (
                    <ChecklistRoomLoadPanel
                      label={
                        selected.kind === 'room'
                          ? 'Loading room checklist…'
                          : 'Loading checklist…'
                      }
                    />
                  ) : displayItems.length === 0 ? (
                    <p className="checklist-item-section__empty">
                      No items saved yet. Browse the{' '}
                      {onOpenChecklist ? (
                        <button
                          type="button"
                          className="shopping-lists-header-link"
                          onClick={() =>
                            selected.kind === 'room' && selected.roomId
                              ? onOpenChecklist({
                                  roomId: selected.roomId,
                                  listId: selected.id,
                                })
                              : onOpenChecklist({ listId: selected.id })
                          }
                        >
                          Toova checklist
                        </button>
                      ) : (
                        'Toova checklist'
                      )}{' '}
                      and use Add to checklist on any product.
                    </p>
                  ) : (
                    <ul className="shopping-lists-items">
                      {displayItems.map((entry) => {
                        const product = productsById[entry.productId];
                        const price = product
                          ? formatPriceCents(product.priceCents, product.currency)
                          : null;
                        return (
                          <li key={entry.productId} className="shopping-lists-items__row">
                            <div className="shopping-lists-items__main">
                              {product?.imageUrl ? (
                                <img
                                  className="shopping-lists-items__thumb"
                                  src={product.imageUrl}
                                  alt=""
                                />
                              ) : (
                                <span className="shopping-lists-items__thumb" aria-hidden />
                              )}
                              <div>
                                <span className="shopping-lists-items__name">
                                  {product?.name ?? entry.productId}
                                </span>
                                {price ? (
                                  <MonoMeta size="xs" tone="subtle">
                                    {price}
                                  </MonoMeta>
                                ) : null}
                              </div>
                            </div>
                            <div className="shopping-lists-items__controls">
                              <label>
                                <span className="sr-only">Quantity</span>
                                <input
                                  type="number"
                                  min={1}
                                  className="shopping-lists-items__qty"
                                  value={entry.quantity}
                                  onChange={(e) => {
                                    const qty = Number(e.target.value);
                                    if (!Number.isFinite(qty)) return;
                                    void updateChecklistListItemQty(
                                      user.id,
                                      selected,
                                      entry.productId,
                                      qty,
                                    ).then(() => afterListMutation(selected));
                                  }}
                                />
                              </label>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void removeChecklistListItem(user.id, selected, entry.productId).then(
                                    () => afterListMutation(selected),
                                  )
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : (
                <p className="checklist-item-section__empty">Select a checklist to view items.</p>
              )}
            </div>
          </div>
        ) : null}

        <div className="shopping-lists-index-wrap" style={{ marginTop: 32 }}>
          <MonoMeta size="sm" tone="dense" upper className="shopping-lists-index__heading">
            New custom checklist
          </MonoMeta>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <input
              className="shopping-lists-items__qty"
              style={{ flex: '1 1 200px', width: 'auto' }}
              placeholder="Name your list"
              value={creatingName}
              onChange={(e) => setCreatingName(e.target.value)}
            />
            <Button size="sm" onClick={handleCreate}>
              Create checklist
            </Button>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

function ListIndexSidebar({
  lists,
  customLists,
  selectedId,
  onSelect,
}: {
  lists: UserChecklistListMeta[];
  customLists: UserChecklistListMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="shopping-lists-index-wrap">
      <MonoMeta size="sm" tone="dense" upper className="shopping-lists-index__heading">
        Room checklists
      </MonoMeta>
      <ul className="shopping-lists-index">
        {lists.map((list) => (
          <li key={list.id}>
            <button
              type="button"
              className={[
                'shopping-lists-index__row',
                selectedId === list.id ? 'shopping-lists-index__row--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(list.id)}
            >
              <span className="shopping-lists-index__name">{list.name}</span>
              <MonoMeta size="xs" tone="subtle">
                Linked to a saved room
              </MonoMeta>
            </button>
          </li>
        ))}
        {lists.length === 0 ? (
          <li className="checklist-item-section__empty" style={{ padding: 14 }}>
            No rooms yet.
          </li>
        ) : null}
      </ul>

      <MonoMeta
        size="sm"
        tone="dense"
        upper
        className="shopping-lists-index__heading shopping-lists-index__heading--spaced"
      >
        Custom checklists
      </MonoMeta>
      <ul className="shopping-lists-index">
        {customLists.map((list) => (
          <li key={list.id}>
            <button
              type="button"
              className={[
                'shopping-lists-index__row',
                selectedId === list.id ? 'shopping-lists-index__row--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(list.id)}
            >
              <span className="shopping-lists-index__name">{list.name}</span>
              <MonoMeta size="xs" tone="subtle">
                Your own list
              </MonoMeta>
            </button>
          </li>
        ))}
        {customLists.length === 0 ? (
          <li className="checklist-item-section__empty" style={{ padding: 14 }}>
            None yet—create one below.
          </li>
        ) : null}
      </ul>
    </aside>
  );
}