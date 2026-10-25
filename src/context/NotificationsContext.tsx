import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useAuthOptional } from '../hooks/useAuth';
import {
  notificationIntent,
  type AppNotification,
  type NotificationIntent,
} from '../lib/notifications';
import {
  clearNotificationError,
  dismissNotificationToast,
  getNotificationsSnapshot,
  markAllNotificationsRead,
  markNotificationRead,
  reloadNotifications,
  setNotificationsUser,
  subscribeNotifications,
  type NotificationsSnapshot,
} from '../lib/notificationsStore';

export type NotificationActivateHandler = (
  notification: AppNotification,
  intent: NotificationIntent,
) => void | Promise<void>;

type NotificationsContextValue = NotificationsSnapshot & {
  reload: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismissToast: (id: string) => void;
  clearError: () => void;
  activate: (notification: AppNotification) => Promise<void>;
  registerActivateHandler: (handler: NotificationActivateHandler | null) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({
  children,
  userId,
}: {
  children: ReactNode;
  /** Optional override for harnesses/tests that are not wrapped in AuthProvider. */
  userId?: string | null;
}) {
  const auth = useAuthOptional();
  const resolvedUserId = userId !== undefined ? userId : auth?.user?.id ?? null;
  const activateHandlerRef = useRef<NotificationActivateHandler | null>(null);
  const snapshot = useSyncExternalStore(
    subscribeNotifications,
    getNotificationsSnapshot,
    getNotificationsSnapshot,
  );

  useEffect(() => {
    setNotificationsUser(resolvedUserId);
  }, [resolvedUserId]);

  const registerActivateHandler = useCallback((handler: NotificationActivateHandler | null) => {
    activateHandlerRef.current = handler;
  }, []);

  const activate = useCallback(async (notification: AppNotification) => {
    const intent = notificationIntent(notification);
    await activateHandlerRef.current?.(notification, intent);
    if (!notification.read_at) {
      await markNotificationRead(notification.id);
    }
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      ...snapshot,
      reload: reloadNotifications,
      markRead: markNotificationRead,
      markAllRead: markAllNotificationsRead,
      dismissToast: dismissNotificationToast,
      clearError: clearNotificationError,
      activate,
      registerActivateHandler,
    }),
    [snapshot, activate, registerActivateHandler],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return ctx;
}

/** Optional consumer for chrome that may render before the provider in tests/harnesses. */
export function useNotificationsOptional(): NotificationsContextValue | null {
  return useContext(NotificationsContext);
}

/** Register the app-level destination handler from AppContent. */
export function useNotificationActivateHandler(handler: NotificationActivateHandler): void {
  const ctx = useNotificationsOptional();
  useEffect(() => {
    if (!ctx) return;
    ctx.registerActivateHandler(handler);
    return () => ctx.registerActivateHandler(null);
  }, [ctx, handler]);
}
