import { beforeEach, describe, expect, it, vi } from 'vitest';

const glbFile = new File([new Blob(['glb'])], 'generated.glb', { type: 'model/gltf-binary' });

const conversionJobState = vi.hoisted(() => ({
  status: 'processing' as 'queued' | 'processing' | 'completed' | 'failed',
  result_path: null as string | null,
}));

vi.mock('./analytics', () => ({
  trackModelGenerationFailed: vi.fn(),
  trackModelGenerationStarted: vi.fn(),
  trackCreditsSpent: vi.fn(),
  trackModelGenerationSucceeded: vi.fn(),
}));

vi.mock('./conversionJobs', () => ({
  createConversionJob: vi.fn(async () => 'job-detach'),
  failInterruptedConversionJob: vi.fn(),
  fetchConversionJob: vi.fn(async () => ({
    id: 'job-detach',
    status: conversionJobState.status,
    result_path: conversionJobState.result_path,
    error: null,
  })),
  keepaliveUpdateConversionJob: vi.fn(),
  listOpenTrellisJobs: vi.fn(async () => []),
  listReadyTrellisJobs: vi.fn(async () => []),
  updateConversionJob: vi.fn(async () => {}),
}));

vi.mock('./generationQueueStore', () => ({
  deleteGenerationAsset: vi.fn(),
  fileFromAsset: vi.fn(),
  listGenerationAssets: vi.fn(async () => []),
  putGenerationAsset: vi.fn(async () => {}),
}));

vi.mock('./modelStorage', () => ({
  MODEL_FILES_BUCKET: 'model-files',
  signModelObjectPath: vi.fn(async () => 'https://example.test/result.glb'),
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
      }),
    },
  },
  SUPABASE_PUBLISHABLE_KEY: 'test',
  SUPABASE_URL: 'https://example.supabase.co',
}));

vi.mock('./trellisAuth', () => ({ trellisAuthHeaders: vi.fn(async () => ({})) }));
vi.mock('./trellisApi', () => ({ trellisSiblingUrl: (path: string) => path }));
vi.mock('./webpToJpeg', () => ({
  ensureJpegForTrellis: vi.fn(async (file: File) => file),
}));
vi.mock('./trellisGenerate', () => ({ generateGlbFromPhoto: vi.fn() }));

global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url === 'jobs' && init?.method === 'POST') {
    return new Response('', { status: 202 });
  }
  if (url === 'https://example.test/result.glb') {
    return new Response(await glbFile.arrayBuffer(), { status: 200 });
  }
  return new Response('not found', { status: 404 });
}) as typeof fetch;

describe('generation queue detach', () => {
  beforeEach(() => {
    conversionJobState.status = 'processing';
    conversionJobState.result_path = null;
    vi.clearAllMocks();
    vi.stubGlobal('window', { addEventListener: vi.fn() });
  });

  it('keeps a ready item after detach (no auto-dismiss)', async () => {
    const {
      detachGenerationWaiter,
      enqueuePhotoGenerate,
      getGenerationQueueSnapshot,
      resetGenerationQueueForTests,
    } = await import('./generationQueue');
    resetGenerationQueueForTests();

    const source = new File([new Blob(['img'])], 'chair.jpg', { type: 'image/jpeg' });
    const abort = new AbortController();
    let rejectErr: unknown;

    const run = enqueuePhotoGenerate({
      userId: 'user-1',
      file: source,
      label: 'chair.jpg',
      signal: abort.signal,
      onStatus: () => {},
    }).catch((err) => {
      rejectErr = err;
    });

    await vi.waitFor(() => {
      expect(getGenerationQueueSnapshot().items.some((i) => i.jobId === 'job-detach')).toBe(true);
    });

    detachGenerationWaiter('job-detach');

    await vi.waitFor(() => {
      expect(rejectErr).toBeInstanceOf(DOMException);
      expect((rejectErr as DOMException).name).toBe('AbortError');
    });

    conversionJobState.status = 'completed';
    conversionJobState.result_path = 'user/jobs/job-detach/result.glb';

    await vi.waitFor(
      async () => {
        await run;
        const item = getGenerationQueueSnapshot().items.find((i) => i.jobId === 'job-detach');
        expect(item?.status).toBe('ready');
      },
      { timeout: 8000, interval: 50 },
    );
  });
});