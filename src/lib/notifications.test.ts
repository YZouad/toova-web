import { describe, expect, it } from 'vitest';
import {
  markItemsRead,
  mergeNotifications,
  notificationIntent,
  parseNotificationRow,
  shouldToastNotification,
  unreadCount,
  type AppNotification,
} from './notifications';

function note(partial: Partial<AppNotification> & Pick<AppNotification, 'id'>): AppNotification {
  return {
    kind: 'system',
    title: 'Notification',
    body: null,
    payload: {},
    read_at: null,
    created_at: '2026-10-24T12:00:00.000Z',
    ...partial,
  };
}

describe('parseNotificationRow', () => {
  it('maps RPC rows and falls back safely', () => {
    expect(
      parseNotificationRow({
        id: 'a',
        kind: 'room_liked',
        title: 'Liked',
        body: null,
        payload: { room_id: '11111111-1111-4111-8111-111111111111' },
        read_at: null,
        created_at: '2026-10-01T00:00:00.000Z',
      }),
    ).toEqual({
      id: 'a',
      kind: 'room_liked',
      title: 'Liked',
      body: null,
      payload: { room_id: '11111111-1111-4111-8111-111111111111' },
      read_at: null,
      created_at: '2026-10-01T00:00:00.000Z',
    });

    expect(parseNotificationRow({ kind: 'nope', payload: 'x' }).kind).toBe('system');
    expect(parseNotificationRow({ kind: 'nope', payload: 'x' }).payload).toEqual({});
  });
});

describe('notificationIntent', () => {
  const roomId = '22222222-2222-4222-8222-222222222222';
  const jobId = '33333333-3333-4333-8333-333333333333';

  it('routes social notifications to the designer when room_id is valid', () => {
    expect(
      notificationIntent(
        note({ id: '1', kind: 'room_liked', payload: { room_id: roomId } }),
      ),
    ).toEqual({ type: 'designer', roomId });
    expect(
      notificationIntent(
        note({ id: '2', kind: 'room_copied', payload: { room_id: 'bad' } }),
      ),
    ).toEqual({ type: 'dashboard' });
  });

  it('routes model_ready to modelJob or models fallback', () => {
    expect(
      notificationIntent(note({ id: '3', kind: 'model_ready', payload: { job_id: jobId } })),
    ).toEqual({ type: 'modelJob', jobId });
    expect(notificationIntent(note({ id: '4', kind: 'model_ready', payload: {} }))).toEqual({
      type: 'models',
    });
  });

  it('maps lifecycle kinds and system noop', () => {
    expect(notificationIntent(note({ id: '5', kind: 'credits_refreshed' }))).toEqual({
      type: 'pricing',
    });
    expect(notificationIntent(note({ id: '6', kind: 'finish_room' }))).toEqual({
      type: 'dashboard',
    });
    expect(
      notificationIntent(
        note({ id: '7', kind: 'move_in_countdown', payload: { room_id: roomId } }),
      ),
    ).toEqual({ type: 'checklist', roomId });
    expect(notificationIntent(note({ id: '8', kind: 'system' }))).toEqual({ type: 'noop' });
  });
});

describe('merge and unread helpers', () => {
  it('merges by id, prefers newer created_at order, and counts unread', () => {
    const merged = mergeNotifications(
      [note({ id: '1', title: 'Old', created_at: '2026-10-01T00:00:00.000Z' })],
      [
        note({
          id: '1',
          title: 'Updated',
          read_at: '2026-10-02T00:00:00.000Z',
          created_at: '2026-10-01T00:00:00.000Z',
        }),
        note({ id: '2', title: 'Newer', created_at: '2026-10-03T00:00:00.000Z' }),
      ],
    );
    expect(merged.map((item) => item.id)).toEqual(['2', '1']);
    expect(merged[1]?.title).toBe('Updated');
    expect(unreadCount(merged)).toBe(1);
    expect(markItemsRead(merged, ['2'])[0]?.read_at).toBeTruthy();
  });
});

describe('shouldToastNotification', () => {
  it('only toasts fresh unread high-priority kinds', () => {
    const knownIds = new Set<string>(['known']);
    const dismissedIds = new Set<string>(['dismissed']);
    expect(
      shouldToastNotification(
        note({ id: 'fresh', kind: 'model_ready' }),
        { knownIds, dismissedIds },
      ),
    ).toBe(true);
    expect(
      shouldToastNotification(
        note({ id: 'fresh', kind: 'room_liked' }),
        { knownIds, dismissedIds },
      ),
    ).toBe(false);
    expect(
      shouldToastNotification(
        note({ id: 'known', kind: 'model_ready' }),
        { knownIds, dismissedIds },
      ),
    ).toBe(false);
    expect(
      shouldToastNotification(
        note({ id: 'dismissed', kind: 'credits_refreshed' }),
        { knownIds, dismissedIds },
      ),
    ).toBe(false);
    expect(
      shouldToastNotification(
        note({
          id: 'read',
          kind: 'move_in_countdown',
          read_at: '2026-10-24T00:00:00.000Z',
        }),
        { knownIds, dismissedIds },
      ),
    ).toBe(false);
  });
});
