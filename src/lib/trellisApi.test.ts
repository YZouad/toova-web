import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('trellisSiblingUrl', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('derives wake and status URLs from a trailing /generate path', async () => {
    vi.stubEnv('VITE_TRELLIS_GENERATE_URL', 'https://toova-bff.onrender.com/api/trellis/generate');
    const { trellisSiblingUrl } = await import('./trellisApi');

    expect(trellisSiblingUrl('wake')).toBe('https://toova-bff.onrender.com/api/trellis/wake');
    expect(trellisSiblingUrl('status')).toBe('https://toova-bff.onrender.com/api/trellis/status');
  });

  it('derives same-origin wake and status URLs in local dev', async () => {
    vi.stubEnv('VITE_TRELLIS_GENERATE_URL', '');
    const { trellisSiblingUrl } = await import('./trellisApi');

    expect(trellisSiblingUrl('wake')).toBe('/api/trellis/wake');
    expect(trellisSiblingUrl('status')).toBe('/api/trellis/status');
  });

  it('throws when TRELLIS_GENERATE_URL does not end with /generate', async () => {
    vi.stubEnv('VITE_TRELLIS_GENERATE_URL', 'https://toova-bff.onrender.com/api/trellis/generate-extra');
    const { trellisSiblingUrl } = await import('./trellisApi');

    expect(() => trellisSiblingUrl('wake')).toThrow('Unexpected TRELLIS_GENERATE_URL');
  });
});

describe('ensureTrellisReady', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('wakes and polls on the same-origin dev proxy URL', async () => {
    vi.stubEnv('VITE_TRELLIS_GENERATE_URL', '');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/wake') || url.endsWith('/status')) {
        return new Response(JSON.stringify({ ready: true, ec2: 'running', trellis: 'ready' }), {
          status: 200,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { ensureTrellisReady } = await import('./trellisApi');
    await expect(ensureTrellisReady()).resolves.toBeUndefined();
  });

  it('polls status until ready and respects abort before generate', async () => {
    vi.stubEnv('VITE_TRELLIS_GENERATE_URL', 'https://toova-bff.onrender.com/api/trellis/generate');
    const controller = new AbortController();

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/wake')) {
        return new Response(JSON.stringify({ ready: false }), { status: 200 });
      }
      if (url.endsWith('/status')) {
        controller.abort();
        return new Response(JSON.stringify({ ready: false, ec2: 'pending', trellis: 'unreachable' }), {
          status: 200,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { ensureTrellisReady } = await import('./trellisApi');
    const readyPromise = ensureTrellisReady(controller.signal);

    await expect(readyPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSpy.mock.calls.some(([url]) => String(url).endsWith('/wake'))).toBe(true);
    expect(fetchSpy.mock.calls.some(([url]) => String(url).endsWith('/status'))).toBe(true);
  });

  it('returns once status reports ready', async () => {
    vi.stubEnv('VITE_TRELLIS_GENERATE_URL', 'https://toova-bff.onrender.com/api/trellis/generate');

    let statusCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/wake')) {
        return new Response(JSON.stringify({ ready: false }), { status: 200 });
      }
      if (url.endsWith('/status')) {
        statusCalls += 1;
        const ready = statusCalls >= 2;
        return new Response(
          JSON.stringify({ ready, ec2: 'running', trellis: ready ? 'ready' : 'unreachable' }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { ensureTrellisReady, TRELLIS_STATUS_POLL_MS } = await import('./trellisApi');
    const readyPromise = ensureTrellisReady();

    await vi.advanceTimersByTimeAsync(TRELLIS_STATUS_POLL_MS);
    await expect(readyPromise).resolves.toBeUndefined();
    expect(statusCalls).toBeGreaterThanOrEqual(2);
  });

  it('rewrites insufficient-space wake errors with a retry hint', async () => {
    vi.stubEnv('VITE_TRELLIS_GENERATE_URL', '');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/wake')) {
        return new Response(
          JSON.stringify({ error: 'InsufficientInstanceCapacity: insufficient space in the AZ' }),
          { status: 503 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { ensureTrellisReady, TRELLIS_INSUFFICIENT_SPACE_MESSAGE } = await import('./trellisApi');
    await expect(ensureTrellisReady()).rejects.toThrow(TRELLIS_INSUFFICIENT_SPACE_MESSAGE);
  });

  it('stops polling when status reports insufficient space', async () => {
    vi.stubEnv('VITE_TRELLIS_GENERATE_URL', '');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/wake')) {
        return new Response(JSON.stringify({ ready: false }), { status: 200 });
      }
      if (url.endsWith('/status')) {
        return new Response(
          JSON.stringify({ ready: false, ec2: 'pending', error: 'insufficient space' }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { ensureTrellisReady, TRELLIS_INSUFFICIENT_SPACE_MESSAGE } = await import('./trellisApi');
    await expect(ensureTrellisReady()).rejects.toThrow(TRELLIS_INSUFFICIENT_SPACE_MESSAGE);
  });
});

describe('formatTrellisError', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps unrelated errors and fills an empty fallback', async () => {
    vi.stubEnv('VITE_TRELLIS_GENERATE_URL', '');
    const { formatTrellisError } = await import('./trellisApi');
    expect(formatTrellisError('Generation failed (500)', 'fallback')).toBe('Generation failed (500)');
    expect(formatTrellisError('   ', 'Could not start')).toBe('Could not start');
  });

  it('detects insufficient space in raw and JSON payloads', async () => {
    vi.stubEnv('VITE_TRELLIS_GENERATE_URL', '');
    const { formatTrellisError, TRELLIS_INSUFFICIENT_SPACE_MESSAGE } = await import('./trellisApi');
    expect(formatTrellisError('insufficient space on host', 'fallback')).toBe(
      TRELLIS_INSUFFICIENT_SPACE_MESSAGE,
    );
    expect(
      formatTrellisError(JSON.stringify({ message: 'AWS not enough capacity right now' }), 'fallback'),
    ).toBe(TRELLIS_INSUFFICIENT_SPACE_MESSAGE);
  });
});
