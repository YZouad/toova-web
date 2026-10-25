import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNotificationsOptional } from '../context/NotificationsContext';
import { Button } from './kit/Button';
import type { AppNotification } from '../lib/notifications';

const AUTO_DISMISS_MS = 8_000;

function ToastCard({
  notification,
  onOpen,
  onDismiss,
}: {
  notification: AppNotification;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(AUTO_DISMISS_MS);
  const startedRef = useRef(Date.now());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (paused) {
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedRef.current));
      clear();
      return clear;
    }

    startedRef.current = Date.now();
    timerRef.current = window.setTimeout(() => {
      onDismiss();
    }, remainingRef.current);

    return clear;
  }, [paused, onDismiss, notification.id]);

  return (
    <div
      className="notification-toast"
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div className="notification-toast__copy">
        <span className="notification-toast__label">New</span>
        <strong className="notification-toast__title">{notification.title}</strong>
        {notification.body ? (
          <span className="notification-toast__body">{notification.body}</span>
        ) : null}
      </div>
      <div className="notification-toast__actions">
        <Button size="sm" onClick={onOpen}>
          Open
        </Button>
        <Button size="sm" variant="outline" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function NotificationToastHost() {
  const notifications = useNotificationsOptional();
  if (!notifications || typeof document === 'undefined') return null;
  if (notifications.toasts.length === 0) return null;

  return createPortal(
    <div className="notification-toast-host" aria-live="polite">
      {notifications.toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          notification={toast}
          onOpen={() => {
            void notifications.activate(toast).finally(() => {
              notifications.dismissToast(toast.id);
            });
          }}
          onDismiss={() => notifications.dismissToast(toast.id)}
        />
      ))}
    </div>,
    document.body,
  );
}
