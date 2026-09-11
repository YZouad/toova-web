import { describe, expect, it } from 'vitest';
import {
  EVENTS,
  inferDevice,
  isAllowedEventName,
  parseUtm,
  sanitizeEventProperties,
} from './analyticsSchema';
import { prepareCollectBatch, sanitizeProperties } from '../../supabase/functions/collect-analytics/policy';

describe('analyticsSchema', () => {
  it('allow-lists catalog events and page/session names', () => {
    expect(isAllowedEventName(EVENTS.ROOM_CREATED)).toBe(true);
    expect(isAllowedEventName(EVENTS.PAGE_VIEW)).toBe(true);
    expect(isAllowedEventName('drop_table')).toBe(false);
  });

  it('strips PII and unknown properties while keeping bounded fields', () => {
    const cleaned = sanitizeEventProperties({
      email: 'yanis@example.com',
      user_id: '11111111-1111-1111-1111-111111111111',
      query: 'desk lamp',
      results_count: 4,
      nested: { nope: true },
      note: 'free text',
    });
    expect(cleaned).toEqual({ query: 'desk lamp', results_count: 4 });
  });

  it('drops email-shaped strings even in allowed fields', () => {
    expect(sanitizeEventProperties({ query: 'a@b.com', results_count: 0 })).toEqual({
      results_count: 0,
    });
  });

  it('infers device and UTM context', () => {
    expect(inferDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('mobile');
    expect(inferDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
    expect(parseUtm('?utm_source=ig&utm_medium=social&utm_campaign=spring')).toEqual({
      utm_source: 'ig',
      utm_medium: 'social',
      utm_campaign: 'spring',
    });
  });
});

describe('collect-analytics policy', () => {
  const base = {
    event_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    name: 'page_view',
    occurred_at: new Date().toISOString(),
    session_id: 'session-abcdef',
    anonymous_id: 'anon-12345678',
    properties: { page_path: '/gallery' },
  };

  it('rejects malformed batches and oversize payloads', () => {
    expect(prepareCollectBatch(null, null)).toMatchObject({ status: 400 });
    const tooMany = { events: Array.from({ length: 26 }, () => base) };
    expect(prepareCollectBatch(tooMany, null)).toMatchObject({ status: 400 });
  });

  it('strips client user_id and invalid events', () => {
    const prepared = prepareCollectBatch(
      {
        events: [
          { ...base, user_id: 'should-not-trust', properties: { email: 'a@b.com', page_path: '/u/x' } },
          { ...base, event_id: 'nope', name: 'page_view' },
        ],
      },
      '11111111-1111-4111-8111-111111111111',
    );
    if ('error' in prepared) throw new Error(prepared.error);
    expect(prepared.rejected).toBe(1);
    expect(prepared.events[0]?.user_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(prepared.events[0]?.properties).toEqual({ page_path: '/u/x' });
  });

  it('is idempotent-ready by requiring uuid event ids', () => {
    const once = prepareCollectBatch({ events: [base] }, null);
    const twice = prepareCollectBatch({ events: [base] }, null);
    if ('error' in once || 'error' in twice) throw new Error('unexpected');
    expect(once.events[0]?.event_id).toBe(twice.events[0]?.event_id);
  });

  it('sanitizes collector properties independently', () => {
    expect(sanitizeProperties({ password: 'x', duration_ms: 1200 })).toEqual({ duration_ms: 1200 });
  });
});
