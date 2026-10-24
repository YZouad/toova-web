import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  NotificationsProvider,
  useNotificationActivateHandler,
  useNotifications,
} from '../context/NotificationsContext';
import { AppRailChrome } from '../ui/AppRailChrome';
import { NotificationPreferences } from '../ui/NotificationPreferences';
import { NotificationToastHost } from '../ui/NotificationToastHost';
import { parseNotificationRow, type AppNotification } from '../lib/notifications';
import {
  __harnessLoadNotifications,
  __harnessPushNotification,
  dismissNotificationToast,
  getNotificationsSnapshot,
  markAllNotificationsRead,
  markNotificationRead,
} from '../lib/notificationsStore';
import { supabase } from '../lib/supabase';
import '../app.css';

const FIXTURE: AppNotification[] = [
  parseNotificationRow({
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'room_copied',
    title: 'Someone copied your room',
    body: 'Woodlawn Room was remixed.',
    payload: { room_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    read_at: null,
    created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  }),
  parseNotificationRow({
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'model_ready',
    title: 'Your model is ready',
    body: 'Desk lamp finished generating.',
    payload: { job_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    read_at: null,
    created_at: new Date(Date.now() - 60_000).toISOString(),
  }),
  parseNotificationRow({
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'room_liked',
    title: 'Someone liked your room',
    body: 'Fall moodboard got a like.',
    payload: { room_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    read_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  }),
];

declare global {
  interface Window {
    __TOOVA_NOTIF_HARNESS__?: {
      getSnapshot: typeof getNotificationsSnapshot;
      markAllRead: typeof markAllNotificationsRead;
      markRead: typeof markNotificationRead;
      dismissToast: typeof dismissNotificationToast;
      pushToast: (partial?: Partial<AppNotification>) => void;
      getActions: () => string[];
      reloadFixture: () => void;
    };
  }
}

function mockSupabaseForHarness(): void {
  const client = supabase as unknown as {
    rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: null }>;
    from: (table: string) => unknown;
    channel: () => { on: () => unknown; subscribe: () => unknown };
    removeChannel: () => Promise<{ error: null }>;
  };

  let prefs = {
    email_likes: true,
    email_copies: true,
    email_model_ready: true,
    email_finish_room: true,
    email_credits: true,
    email_move_in: true,
    email_unsubscribed_all: false,
  };

  client.rpc = async (name) => {
    if (name === 'get_my_notifications') return { data: FIXTURE, error: null };
    if (name === 'mark_notifications_read') return { data: 1, error: null };
    return { data: null, error: null };
  };

  client.from = () => {
    const api = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => ({ data: prefs, error: null }),
      single: async () => ({ data: prefs, error: null }),
      insert: (row: Record<string, unknown>) => {
        prefs = { ...prefs, ...row } as typeof prefs;
        return api;
      },
      update: (row: Record<string, unknown>) => {
        prefs = { ...prefs, ...row } as typeof prefs;
        return api;
      },
      upsert: (row: Record<string, unknown>) => {
        prefs = { ...prefs, ...row } as typeof prefs;
        return api;
      },
    };
    return api;
  };

  client.channel = () => {
    const channel = {
      on: () => channel,
      subscribe: () => channel,
    };
    return channel;
  };
  client.removeChannel = async () => ({ error: null });
}

function HarnessBody() {
  const notifications = useNotifications();
  const [actions, setActions] = useState<string[]>([]);

  useNotificationActivateHandler(async (_notification, intent) => {
    setActions((prev) => [...prev, intent.type]);
  });

  useEffect(() => {
    __harnessLoadNotifications(FIXTURE, { userId: 'harness-user' });
    window.__TOOVA_NOTIF_HARNESS__ = {
      getSnapshot: getNotificationsSnapshot,
      markAllRead: async () => {
        await markAllNotificationsRead();
      },
      markRead: markNotificationRead,
      dismissToast: dismissNotificationToast,
      reloadFixture: () => __harnessLoadNotifications(FIXTURE, { userId: 'harness-user' }),
      pushToast: (partial) => {
        __harnessPushNotification(
          parseNotificationRow({
            id: partial?.id ?? crypto.randomUUID(),
            kind: partial?.kind ?? 'model_ready',
            title: partial?.title ?? 'Your model is ready',
            body: partial?.body ?? 'Harness toast body',
            payload: partial?.payload ?? {
              job_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            },
            read_at: null,
            created_at: new Date().toISOString(),
          }),
        );
      },
      getActions: () => actions,
    };
  }, [actions]);

  return (
    <div className="marketing-page kit-app-rail-pad" style={{ minHeight: '100vh', padding: 72 }}>
      <AppRailChrome
        active={null}
        profileInitials="YZ"
        onNavigate={() => undefined}
        onProfile={() => undefined}
        onLogout={() => undefined}
      />
      <p className="landing-hero__eyebrow">TOOVA — NOTIFICATIONS HARNESS</p>
      <h1 className="landing-hero__title">Own it before you buy it.</h1>
      <p data-testid="notif-harness-status">
        {notifications.unread > 0 ? `${notifications.unread} unread` : 'caught up'}
      </p>
      <p data-testid="notif-harness-actions">{actions.join(',')}</p>
      <NotificationPreferences userId="harness-user" />
    </div>
  );
}

mockSupabaseForHarness();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NotificationsProvider userId="harness-user">
      <NotificationToastHost />
      <HarnessBody />
    </NotificationsProvider>
  </React.StrictMode>,
);
