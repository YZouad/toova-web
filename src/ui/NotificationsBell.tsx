import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useNotificationsOptional } from '../context/NotificationsContext';
import { formatRelativeTime } from '../lib/userDisplay';
import { Button } from './kit/Button';
import type { AppNotification } from '../lib/notifications';

export type { AppNotification };

type Placement = 'header' | 'rail';

type PanelSide = 'above' | 'below' | 'left' | 'right';

type PanelPos = {
  top: number;
  left: number;
  maxHeight: number;
  side: PanelSide;
  anchorOffset: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function computePanelPos(
  trigger: HTMLElement,
  placement: Placement,
  panel?: HTMLElement | null,
): PanelPos {
  const rect = trigger.getBoundingClientRect();
  const gap = 10;
  const sideGap = 4;
  const width = Math.min(340, window.innerWidth - 24);
  const pad = 12;
  const maxHeight = Math.min(420, window.innerHeight - pad * 2);
  const panelWidth = panel?.offsetWidth || width;
  const panelHeight = Math.min(panel?.offsetHeight || 220, maxHeight);
  const triggerCenterX = rect.left + rect.width / 2;
  const triggerCenterY = rect.top + rect.height / 2;

  if (placement === 'rail') {
    const fitsRight = rect.right + sideGap + panelWidth <= window.innerWidth - pad;
    const fitsLeft = rect.left - sideGap - panelWidth >= pad;

    if (fitsRight || fitsLeft) {
      const side: PanelSide = fitsRight ? 'right' : 'left';
      const left = fitsRight ? rect.right + sideGap : rect.left - sideGap - panelWidth;
      const top = clamp(
        triggerCenterY - panelHeight / 2,
        pad,
        window.innerHeight - pad - panelHeight,
      );
      return {
        top,
        left,
        maxHeight,
        side,
        anchorOffset: clamp(triggerCenterY - top, 18, panelHeight - 18),
      };
    }

    const openBelow =
      window.innerHeight - rect.bottom >= panelHeight + gap ||
      window.innerHeight - rect.bottom >= rect.top;
    const top = openBelow
      ? Math.min(rect.bottom + gap, window.innerHeight - pad - panelHeight)
      : Math.max(pad, rect.top - gap - panelHeight);
    const left = clamp(
      triggerCenterX - panelWidth / 2,
      pad,
      window.innerWidth - pad - panelWidth,
    );
    return {
      top,
      left,
      maxHeight,
      side: openBelow ? 'below' : 'above',
      anchorOffset: clamp(triggerCenterX - left, 18, panelWidth - 18),
    };
  }

  const openBelow =
    window.innerHeight - rect.bottom >= panelHeight + gap ||
    window.innerHeight - rect.bottom >= rect.top;
  const left = clamp(rect.right - panelWidth, pad, window.innerWidth - pad - panelWidth);
  const top = openBelow
    ? Math.min(rect.bottom + gap, window.innerHeight - pad - panelHeight)
    : Math.max(pad, rect.top - gap - panelHeight);
  return {
    top,
    left,
    maxHeight,
    side: openBelow ? 'below' : 'above',
    anchorOffset: clamp(triggerCenterX - left, 18, panelWidth - 18),
  };
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
  const notifications = useNotificationsOptional();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const panelId = useId();
  const panelTitleId = useId();
  const liveId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef(false);

  const items = notifications?.items ?? [];
  const unread = notifications?.unread ?? 0;
  const loading = notifications?.loading ?? false;
  const error = actionError ?? notifications?.error ?? null;
  const markingAll = notifications?.markingAll ?? false;
  const markingId = notifications?.markingId ?? null;

  const updatePos = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      setOpen(false);
      return;
    }
    setPos(computePanelPos(el, placement, panelRef.current));
  }, [placement]);

  const closePanel = useCallback((restoreFocus: boolean) => {
    restoreFocusRef.current = restoreFocus;
    setOpen(false);
    setActionError(null);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      if (restoreFocusRef.current) {
        restoreFocusRef.current = false;
        triggerRef.current?.focus();
      }
      return;
    }
    updatePos();
    const panel = panelRef.current;
    if (panel) {
      panel.focus({ preventScroll: true });
    }
  }, [open, updatePos, items.length, loading, error]);

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
      closePanel(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePanel(true);
      }
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, closePanel]);

  if (!enabled || !notifications) return null;

  async function handleActivate(notification: AppNotification) {
    setActivatingId(notification.id);
    setActionError(null);
    try {
      await notifications!.activate(notification);
      closePanel(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not open notification');
    } finally {
      setActivatingId(null);
    }
  }

  function focusItemAt(index: number) {
    const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>('.notif-dropdown__item');
    if (!buttons || buttons.length === 0) return;
    const next = Math.max(0, Math.min(index, buttons.length - 1));
    buttons[next]?.focus();
  }

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>('.notif-dropdown__item');
    if (!buttons || buttons.length === 0) return;
    const currentIndex = Array.from(buttons).indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItemAt(currentIndex < 0 ? 0 : currentIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItemAt(currentIndex < 0 ? buttons.length - 1 : currentIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItemAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItemAt(buttons.length - 1);
    }
  }

  const panel =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            className="notif-dropdown"
            id={panelId}
            role="dialog"
            aria-modal="false"
            aria-labelledby={panelTitleId}
            tabIndex={-1}
            data-side={pos.side}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              right: 'auto',
              maxHeight: pos.maxHeight,
              zIndex: 200,
              '--notif-anchor': `${pos.anchorOffset}px`,
            } as CSSProperties}
            onClick={(event) => {
              event.stopPropagation();
            }}
            onKeyDown={onPanelKeyDown}
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null;
              if (!next) return;
              if (panelRef.current?.contains(next) || rootRef.current?.contains(next)) return;
              closePanel(false);
            }}
          >
            <span className="notif-dropdown__connector" aria-hidden />
            <div className="notif-dropdown__head">
              <div className="notif-dropdown__heading">
                <strong id={panelTitleId}>Notifications</strong>
                <span>{unread > 0 ? `${unread} unread` : 'All caught up'}</span>
              </div>
              {unread > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={markingAll}
                  onClick={() => void notifications.markAllRead()}
                >
                  {markingAll ? 'Marking…' : 'Mark all read'}
                </Button>
              ) : null}
            </div>
            <div className="notif-dropdown__list">
              {error ? (
                <div className="notif-dropdown__empty notif-dropdown__empty--error" role="alert">
                  <span>{error}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setActionError(null);
                      notifications.clearError();
                      void notifications.reload();
                    }}
                  >
                    Try again
                  </Button>
                </div>
              ) : null}
              {loading && items.length === 0 ? (
                <p className="notif-dropdown__empty">Loading notifications…</p>
              ) : null}
              {!error && !loading && items.length === 0 ? (
                <p className="notif-dropdown__empty">No notifications yet.</p>
              ) : null}
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`notif-dropdown__item${!n.read_at ? ' is-unread' : ''}`}
                  disabled={markingId === n.id || activatingId === n.id}
                  onClick={() => void handleActivate(n)}
                >
                  <span className="notif-dropdown__status" aria-hidden />
                  <span className="notif-dropdown__content">
                    <span className="notif-dropdown__title">{n.title}</span>
                    {n.body ? <span className="notif-dropdown__body">{n.body}</span> : null}
                    <time className="notif-dropdown__meta" dateTime={n.created_at}>
                      {formatRelativeTime(n.created_at)}
                    </time>
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={`notif-bell${placement === 'rail' ? ' notif-bell--rail' : ''}`}
    >
      <span id={liveId} className="sr-only" aria-live="polite">
        {loading ? 'Loading notifications' : unread > 0 ? `${unread} unread notifications` : ''}
      </span>
      <Button
        ref={triggerRef}
        size="sm"
        variant="outline"
        className={placement === 'rail' ? 'notif-bell__trigger' : undefined}
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => {
            const next = !v;
            if (next) {
              updatePos();
              void notifications.reload();
            } else {
              setActionError(null);
            }
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
