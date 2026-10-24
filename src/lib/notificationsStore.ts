import { supabase } from './supabase';
import {
  markItemsRead,
  mergeNotifications,
  parseNotificationRow,
  shouldToastNotification,
  unreadCount,
  type AppNotification,
} from './notifications';
import type { RealtimeChannel } from '@supabase/supabase-js';

const POLL_MS = 60_000;
const DISMISSED_TOAST_KEY = 'toova-dismissed-notification-toasts';
const LIMIT = 30;

export type NotificationsSnapshot = {
  userId: string | null;
  items: AppNotification[];
  loading: boolean;
  error: string | null;
  markingAll: boolean;
  markingId: string | null;
  unread: number;
  toasts: AppNotification[];
  hydrated: boolean;
};

type Listener = () => void;

const listeners = new Set<Listener>();

let userId: string | null = null;
let items: AppNotification[] = [];
let loading = false;
let error: string | null = null;
let markingAll = false;
let markingId: string | null = null;
let toasts: AppNotification[] = [];
let hydrated = false;
let knownIds = new Set<string>();
let inFlight: Promise<void> | null = null;
let pollTimer: number | null = null;
let channel: RealtimeChannel | null = null;
let visibilityBound = false;
let cachedSnapshot: NotificationsSnapshot = snapshot();

function snapshot(): NotificationsSnapshot {
  return {
    userId,
    items,
    loading,
    error,
    markingAll,
    markingId,
    unread: unreadCount(items),
    toasts,
    hydrated,
  };
}

function emit(): void {
  cachedSnapshot = snapshot();
  listeners.forEach((listener) => listener());
}

function readDismissedToasts(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_TOAST_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function writeDismissedToasts(set: Set<string>): void {
  try {
    sessionStorage.setItem(DISMISSED_TOAST_KEY, JSON.stringify([...set].slice(-80)));
  } catch {
    /* ignore */
  }
}

function queueToasts(candidates: AppNotification[]): void {
  if (!hydrated) return;
  const dismissed = readDismissedToasts();
  const next: AppNotification[] = [];
  for (const candidate of candidates) {
    if (
      !shouldToastNotification(candidate, {
        knownIds,
        dismissedIds: dismissed,
      })
    ) {
      continue;
    }
    if (toasts.some((toast) => toast.id === candidate.id)) continue;
    if (next.some((toast) => toast.id === candidate.id)) continue;
    next.push(candidate);
  }
  if (next.length === 0) return;
  toasts = [...next, ...toasts].slice(0, 4);
  emit();
}

function rememberIds(rows: AppNotification[]): void {
  for (const row of rows) {
    if (row.id) knownIds.add(row.id);
  }
}

async function fetchRows(): Promise<AppNotification[]> {
  const { data, error: rpcError } = await supabase.rpc('get_my_notifications', {
    p_limit: LIMIT,
  });
  if (rpcError) throw new Error(rpcError.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map(parseNotificationRow);
}

function clearPoll(): void {
  if (pollTimer != null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function clearChannel(): void {
  if (!channel) return;
  const current = channel;
  channel = null;
  void supabase.removeChannel(current);
}

function bindVisibility(): void {
  if (visibilityBound || typeof document === 'undefined') return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && userId) {
      void reloadNotifications();
    }
  });
}

function subscribeRealtime(uid: string): void {
  clearChannel();
  channel = supabase
    .channel(`notifications-${uid}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${uid}`,
      },
      (payload) => {
        if (!payload.new || typeof payload.new !== 'object') return;
        const row = parseNotificationRow(payload.new as Record<string, unknown>);
        if (!row.id) return;
        const fresh = !knownIds.has(row.id);
        items = mergeNotifications(items, [row]);
        if (fresh) queueToasts([row]);
        rememberIds([row]);
        emit();
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${uid}`,
      },
      (payload) => {
        if (!payload.new || typeof payload.new !== 'object') return;
        const row = parseNotificationRow(payload.new as Record<string, unknown>);
        if (!row.id) return;
        items = mergeNotifications(items, [row]);
        if (row.read_at) {
          toasts = toasts.filter((toast) => toast.id !== row.id);
        }
        rememberIds([row]);
        emit();
      },
    )
    .subscribe();
}

export function subscribeNotifications(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNotificationsSnapshot(): NotificationsSnapshot {
  return cachedSnapshot;
}

export async function reloadNotifications(): Promise<void> {
  if (!userId) return;
  if (inFlight) return inFlight;
  loading = true;
  error = null;
  emit();
  inFlight = (async () => {
    try {
      const rows = await fetchRows();
      const previousKnown = knownIds;
      const fresh = rows.filter((row) => row.id && !previousKnown.has(row.id));
      items = mergeNotifications([], rows);
      if (hydrated) queueToasts(fresh);
      rememberIds(rows);
      hydrated = true;
      error = null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not load notifications';
    } finally {
      loading = false;
      inFlight = null;
      emit();
    }
  })();
  return inFlight;
}

export function setNotificationsUser(nextUserId: string | null): void {
  if (userId === nextUserId) return;
  userId = nextUserId;
  items = [];
  toasts = [];
  knownIds = new Set();
  hydrated = false;
  loading = false;
  error = null;
  markingAll = false;
  markingId = null;
  clearPoll();
  clearChannel();
  emit();

  if (!nextUserId) return;

  bindVisibility();
  subscribeRealtime(nextUserId);
  void reloadNotifications();
  pollTimer = window.setInterval(() => {
    void reloadNotifications();
  }, POLL_MS);
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!userId || !id || markingId) return;
  const target = items.find((item) => item.id === id);
  if (!target || target.read_at) return;
  markingId = id;
  error = null;
  emit();
  try {
    const { error: markError } = await supabase.rpc('mark_notifications_read', {
      p_ids: [id],
    });
    if (markError) throw new Error(markError.message);
    items = markItemsRead(items, [id]);
    toasts = toasts.filter((toast) => toast.id !== id);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Could not mark notification as read';
    throw err instanceof Error ? err : new Error(error);
  } finally {
    markingId = null;
    emit();
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  if (!userId || markingAll) return;
  const unreadIds = items.filter((item) => !item.read_at).map((item) => item.id);
  if (unreadIds.length === 0) return;
  markingAll = true;
  error = null;
  emit();
  try {
    const { error: markError } = await supabase.rpc('mark_notifications_read', {
      p_ids: unreadIds,
    });
    if (markError) throw new Error(markError.message);
    items = markItemsRead(items, unreadIds);
    toasts = [];
  } catch (err) {
    error = err instanceof Error ? err.message : 'Could not mark notifications as read';
    throw err instanceof Error ? err : new Error(error);
  } finally {
    markingAll = false;
    emit();
  }
}

export function dismissNotificationToast(id: string): void {
  toasts = toasts.filter((toast) => toast.id !== id);
  const dismissed = readDismissedToasts();
  dismissed.add(id);
  writeDismissedToasts(dismissed);
  emit();
}

export function clearNotificationError(): void {
  if (!error) return;
  error = null;
  emit();
}

/** Test/harness only: replace inbox state without calling Supabase. */
export function __harnessLoadNotifications(
  rows: AppNotification[],
  opts?: { userId?: string; toastRows?: AppNotification[] },
): void {
  userId = opts?.userId ?? 'harness-user';
  clearPoll();
  clearChannel();
  items = mergeNotifications([], rows);
  knownIds = new Set(items.map((item) => item.id).filter(Boolean));
  hydrated = true;
  loading = false;
  error = null;
  markingAll = false;
  markingId = null;
  toasts = opts?.toastRows ?? [];
  emit();
}

/** Test/harness only: append a toast as if Realtime delivered a fresh row. */
export function __harnessPushNotification(row: AppNotification): void {
  const fresh = !knownIds.has(row.id);
  items = mergeNotifications(items, [row]);
  if (fresh) queueToasts([row]);
  rememberIds([row]);
  hydrated = true;
  emit();
}
