import { describe, expect, it } from 'vitest';
import {
  lastActiveSortValue,
  parseAdminUserOverview,
  type AdminUserOverview,
} from './adminUserOverview';

const sample: AdminUserOverview = {
  user: {
    user_id: '11111111-1111-1111-1111-111111111111',
    email: 'yanis@example.com',
    handle: 'yanis',
    display_name: 'Yanis',
    bio: 'Builds rooms',
    avatar_path: '11111111-1111-1111-1111-111111111111/a.jpg',
    is_public: true,
    created_at: '2026-01-01T00:00:00.000Z',
    last_active_at: '2026-09-10T12:00:00.000Z',
    last_sign_in_at: '2026-09-10T11:00:00.000Z',
    plan: 'free',
  },
  rooms: [
    {
      room_id: '22222222-2222-2222-2222-222222222222',
      name: 'Studio',
      visibility: 'public',
      item_count: 4,
      likes_count: 2,
      views_count: 9,
      fork_count: 1,
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      quarantined_at: null,
      thumbnail_path: null,
    },
  ],
  models: [
    {
      kind: 'custom-lamp',
      label: 'Lamp',
      description: null,
      tags: ['lighting'],
      categories: ['lighting'],
      visibility: 'private',
      width_in: 10,
      height_in: 20,
      depth_in: 10,
      clearance_in: null,
      likes_count: 0,
      downloads_count: 0,
      views_count: 3,
      created_at: '2026-03-01T00:00:00.000Z',
      model_url: '11111111-1111-1111-1111-111111111111/lamp.glb',
      thumbnail_path: null,
      quarantined_at: null,
    },
  ],
  analytics: {
    generated_at: '2026-09-10T12:00:00.000Z',
    totals: {
      rooms: 1,
      models: 1,
      placements: 4,
      generations: 2,
      generations_completed: 1,
      generations_failed: 1,
      public_rooms: 1,
      public_models: 0,
    },
    series: [],
    extras: {},
  },
};

describe('parseAdminUserOverview', () => {
  it('round-trips a condensed admin payload and keeps the analytics slot empty', () => {
    const parsed = parseAdminUserOverview(sample);
    expect(parsed?.user.handle).toBe('yanis');
    expect(parsed?.rooms).toHaveLength(1);
    expect(parsed?.models[0]?.visibility).toBe('private');
    expect(parsed?.analytics.series).toEqual([]);
    expect(parsed?.analytics.extras).toEqual({});
    expect(parsed?.analytics.totals.placements).toBe(4);
  });

  it('accepts future custom analytics series and extras without a schema change', () => {
    const parsed = parseAdminUserOverview({
      ...sample,
      analytics: {
        ...sample.analytics,
        series: [
          {
            key: 'sessions_daily',
            label: 'Sessions',
            unit: 'count',
            points: [{ t: '2026-09-09T00:00:00.000Z', v: 3 }],
          },
        ],
        extras: { retention_d7: 0.42 },
      },
    });
    expect(parsed?.analytics.series[0]?.key).toBe('sessions_daily');
    expect(parsed?.analytics.series[0]?.points[0]?.v).toBe(3);
    expect(parsed?.analytics.extras.retention_d7).toBe(0.42);
  });

  it('returns null when the user object is missing', () => {
    expect(parseAdminUserOverview({ rooms: [], models: [] })).toBeNull();
  });
});

describe('lastActiveSortValue', () => {
  it('orders recent activity after older activity and treats missing as 0', () => {
    const older = lastActiveSortValue('2026-01-01T00:00:00.000Z');
    const newer = lastActiveSortValue('2026-09-10T00:00:00.000Z');
    expect(newer).toBeGreaterThan(older);
    expect(lastActiveSortValue(null)).toBe(0);
    expect(lastActiveSortValue('not-a-date')).toBe(0);
  });
});
