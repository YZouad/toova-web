export const NOTIFICATION_KINDS = [
  'room_liked',
  'room_copied',
  'model_ready',
  'credits_refreshed',
  'finish_room',
  'move_in_countdown',
  'system',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type NotificationIntent =
  | { type: 'noop' }
  | { type: 'dashboard' }
  | { type: 'models' }
  | { type: 'pricing' }
  | { type: 'designer'; roomId: string }
  | { type: 'checklist'; roomId?: string }
  | { type: 'modelJob'; jobId: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TOAST_KINDS = new Set<NotificationKind>([
  'model_ready',
  'credits_refreshed',
  'move_in_countdown',
]);

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function parseNotificationKind(value: unknown): NotificationKind {
  if (typeof value === 'string' && (NOTIFICATION_KINDS as readonly string[]).includes(value)) {
    return value as NotificationKind;
  }
  return 'system';
}

export function parseNotificationRow(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id ?? ''),
    kind: parseNotificationKind(row.kind),
    title: String(row.title ?? 'Notification'),
    body: row.body != null ? String(row.body) : null,
    payload:
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {},
    read_at: row.read_at != null ? String(row.read_at) : null,
    created_at: String(row.created_at ?? ''),
  };
}

export function unreadCount(items: AppNotification[]): number {
  return items.filter((item) => !item.read_at).length;
}

export function mergeNotifications(
  existing: AppNotification[],
  incoming: AppNotification[],
): AppNotification[] {
  const byId = new Map<string, AppNotification>();
  for (const item of existing) {
    if (item.id) byId.set(item.id, item);
  }
  for (const item of incoming) {
    if (!item.id) continue;
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? { ...prev, ...item } : item);
  }
  return [...byId.values()].sort((a, b) => {
    const aTime = Date.parse(a.created_at) || 0;
    const bTime = Date.parse(b.created_at) || 0;
    return bTime - aTime;
  });
}

export function markItemsRead(
  items: AppNotification[],
  ids: string[] | null,
  readAt = new Date().toISOString(),
): AppNotification[] {
  if (ids == null) {
    return items.map((item) => ({ ...item, read_at: item.read_at ?? readAt }));
  }
  const idSet = new Set(ids);
  return items.map((item) =>
    idSet.has(item.id) ? { ...item, read_at: item.read_at ?? readAt } : item,
  );
}

export function shouldToastNotification(
  notification: AppNotification,
  opts: { knownIds: ReadonlySet<string>; dismissedIds: ReadonlySet<string> },
): boolean {
  if (!TOAST_KINDS.has(notification.kind)) return false;
  if (notification.read_at) return false;
  if (!notification.id) return false;
  if (opts.dismissedIds.has(notification.id)) return false;
  if (opts.knownIds.has(notification.id)) return false;
  return true;
}

export function notificationIntent(notification: AppNotification): NotificationIntent {
  const { kind, payload } = notification;

  if (kind === 'room_liked' || kind === 'room_copied') {
    if (isUuid(payload.room_id)) return { type: 'designer', roomId: payload.room_id };
    return { type: 'dashboard' };
  }

  if (kind === 'model_ready') {
    if (isUuid(payload.job_id)) return { type: 'modelJob', jobId: payload.job_id };
    return { type: 'models' };
  }

  if (kind === 'credits_refreshed') return { type: 'pricing' };

  if (kind === 'finish_room') return { type: 'dashboard' };

  if (kind === 'move_in_countdown') {
    if (isUuid(payload.room_id)) return { type: 'checklist', roomId: payload.room_id };
    return { type: 'checklist' };
  }

  return { type: 'noop' };
}
