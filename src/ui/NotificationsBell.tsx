import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { formatRelativeTime } from '../lib/userDisplay';
import { Button } from './kit/Button';

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

type Placement = 'header' | 'rail';

type PanelPos = { top: number; left: number; maxHeight: number };

async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase.rpc('get_my_notifications', { p_limit: 30 });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    kind: String(row.kind ?? 'system'),
    title: String(row.title ?? 'Notification'),
    body: row.body != null ? String(row.body) : null,
    payload: (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<
      string,
      unknown
    >,
    read_at: row.read_at != null ? String(row.read_at) : null,
    created_at: String(row.created_at ?? ''),
  }));
}

function computePanelPos(trigger: HTMLElement, placement: Placement): PanelPos {
  const rect = trigger.getBoundingClientRect();
  const gap = 8;
  const width = Math.min(340, window.innerWidth - 24);
  const pad = 12;
  const maxPanel = 360;

  if (placement === 'rail') {
    let left = rect.right + gap;
    if (left + width > window.innerWidth - pad) {
      left = Math.max(pad, rect.left - gap - width);
    }
    const spaceBelow = window.innerHeight - rect.top - pad;
    const spaceAbove = rect.bottom - pad;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(maxPanel, openUp ? spaceAbove - gap : spaceBelow - gap);
    const top = openUp
      ? Math.max(pad, rect.bottom - maxHeight)
      : Math.min(rect.top, window.innerHeight - pad - Math.max(160, maxHeight));
    return { top, left, maxHeight: Math.max(160, maxHeight) };
  }

  let left = rect.right - width;
  left = Math.min(Math.max(pad, left), window.innerWidth - pad - width);
  const top = rect.bottom + gap;
  const maxHeight = Math.min(maxPanel, window.innerHeight - top - pad);
  return { top, left, maxHeight: Math.max(160, maxHeight) };
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9a6 6 0 1 1 12 0c0 3.5 1.5 5 2 6H4c.5-1 2-2.5 2-6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M10 19a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function NotificationsBell({
  enabled,
  placement = 'header',
}: {
  enabled: boolean;
  /** `rail` opens the panel beside the sidebar trigger (portaled). */
  placement?: Placement;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      setError(null);
      setItems(await fetchNotifications());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load notifications');
    }
  }, [enabled]);

  const updatePos = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    setPos(computePanelPos(el, placement));
  }, [placement]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    const timer = window.setInterval(() => void reload(), 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, reload]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
  }, [open, updatePos, items.length]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updatePos();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!enabled) return null;

  const unread = items.filter((n) => !n.read_at).length;

  async function markAllRead() {
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.rpc('mark_notifications_read', { p_ids: unreadIds });
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }

  const panel =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            className="notif-dropdown"
            role="menu"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              right: 'auto',
              maxHeight: pos.maxHeight,
              zIndex: 200,
            }}
          >
            <div className="notif-dropdown__head">
              <strong>Notifications</strong>
              {unread > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => void markAllRead()}>
                  Mark all read
                </Button>
              ) : null}
            </div>
            {error ? <p className="notif-dropdown__empty">{error}</p> : null}
            {!error && items.length === 0 ? (
              <p className="notif-dropdown__empty">No notifications yet.</p>
            ) : null}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                role="menuitem"
                className={`notif-dropdown__item${!n.read_at ? ' is-unread' : ''}`}
                onClick={() => {
                  if (!n.read_at) {
                    void supabase.rpc('mark_notifications_read', { p_ids: [n.id] });
                    setItems((prev) =>
                      prev.map((row) =>
                        row.id === n.id ? { ...row, read_at: new Date().toISOString() } : row,
                      ),
                    );
                  }
                }}
              >
                <span className="notif-dropdown__title">{n.title}</span>
                {n.body ? <span className="notif-dropdown__meta">{n.body}</span> : null}
                <span className="notif-dropdown__meta">{formatRelativeTime(n.created_at)}</span>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={`notif-bell${placement === 'rail' ? ' notif-bell--rail' : ''}`}
    >
      <Button
        size="sm"
        variant="outline"
        className={placement === 'rail' ? 'notif-bell__trigger' : undefined}
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => {
            const next = !v;
            if (next) void reload();
            return next;
          });
        }}
      >
        {placement === 'rail' ? <BellIcon /> : 'Alerts'}
        {unread > 0 ? <span className="notif-bell__badge">{unread > 9 ? '9+' : unread}</span> : null}
      </Button>
      {panel}
    </div>
  );
}
