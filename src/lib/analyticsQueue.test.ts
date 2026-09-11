import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_QUEUE_KEY,
  enqueueAnalyticsEvent,
  flushAnalyticsQueue,
  readAnalyticsQueue,
  resetAnalyticsQueueForTests,
} from './analyticsQueue';
import type { NormalizedAnalyticsEvent } from './analyticsSchema';

function event(id: string): NormalizedAnalyticsEvent {
  return {
    event_id: id,
    name: 'page_view',
    occurred_at: '2026-09-10T12:00:00.000Z',
    session_id: 'session-12345678',
    anonymous_id: 'anon-12345678',
    properties: { page_path: '/' },
    context: { route: '/', device: 'desktop' },
  };
}

describe('analyticsQueue', () => {
  beforeEach(() => {
    resetAnalyticsQueueForTests();
  });

  afterEach(() => {
    resetAnalyticsQueueForTests();
  });

  it('dedupes by event_id', () => {
    expect(enqueueAnalyticsEvent(event('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'))).toBe(true);
    expect(enqueueAnalyticsEvent(event('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'))).toBe(false);
    expect(readAnalyticsQueue()).toHaveLength(1);
  });

  it('flushes successfully and remembers sent ids', async () => {
    enqueueAnalyticsEvent(event('aaaaaaaa-bbbb-4ccc-8ddd-111111111111'));
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await flushAnalyticsQueue({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ sent: 1, remaining: 0, failed: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(enqueueAnalyticsEvent(event('aaaaaaaa-bbbb-4ccc-8ddd-111111111111'))).toBe(false);
  });

  it('retries failed deliveries up to the attempt cap', async () => {
    enqueueAnalyticsEvent(event('aaaaaaaa-bbbb-4ccc-8ddd-222222222222'));
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    await flushAnalyticsQueue({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(readAnalyticsQueue()[0]?.attempts).toBe(1);
    await flushAnalyticsQueue({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await flushAnalyticsQueue({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await flushAnalyticsQueue({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(readAnalyticsQueue()).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('drops the batch on forbidden responses rather than retrying forever', async () => {
    enqueueAnalyticsEvent(event('aaaaaaaa-bbbb-4ccc-8ddd-333333333333'));
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    const result = await flushAnalyticsQueue({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.failed).toBe(true);
    expect(readAnalyticsQueue()).toHaveLength(0);
  });

  it('keeps a storage key for crash recovery', () => {
    expect(ANALYTICS_QUEUE_KEY).toBe('toova-analytics-queue');
  });
});
