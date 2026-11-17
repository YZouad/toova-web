import { beforeEach, describe, expect, it, vi } from 'vitest';

let submitCount = 0;
let createIndex = 0;

const conversionJobState = vi.hoisted(() => ({
  status: 'processing' as 'queued' | 'processing' | 'completed' | 'failed',
}));

vi.mock('./analytics', () => ({
  trackModelGenerationFailed: vi.fn(),
  trackModelGenerationStarted: vi.fn(),
  trackCreditsSpent: vi.fn(),
  trackModelGenerationSucceeded: vi.fn(),
}));

vi.mock('./conversionJobs', () => ({
  createConversionJob: vi.fn(async () => `job-${++createIndex}`),
  failInterruptedConversionJob: vi.fn(),
  fetchConversionJob: vi.fn(async (jobId: string) => ({
    id: jobId,
    status: conversionJobState.status,
    result_path: null,
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
        upload: vi.fn(async () => {
          await new Promise((r) => setTimeout(r, 300));
          return { error: null };
        }),
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
    submitCount += 1;
    return new Response('', { status: 202 });
  }
  return new Response('not found', { status: 404 });
}) as typeof fetch;

describe('generation queue cancel', () => {
  beforeEach(() => {
    createIndex = 0;
    submitCount = 0;
    conversionJobState.status = 'processing';
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal('window', { addEventListener: vi.fn() });
  });

  it('removes a queued job before GPU submit', async () => {
    const { cancelQueuedGeneration, enqueuePhotoGenerate, getGenerationQueueSnapshot, resetGenerationQueueForTests } =
      await import('./generationQueue');
    resetGenerationQueueForTests();

    const mkFile = (name: string) => new File([new Blob(['img'])], name, { type: 'image/jpeg' });

    void enqueuePhotoGenerate({
      userId: 'user-1',
      file: mkFile('first.jpg'),
      label: 'first.jpg',
      signal: new AbortController().signal,
      onStatus: () => {},
    }).catch(() => {});

    await vi.waitFor(() => {
      expect(getGenerationQueueSnapshot().items.some((i) => i.jobId === 'job-1')).toBe(true);
    });

    void enqueuePhotoGenerate({
      userId: 'user-1',
      file: mkFile('second.jpg'),
      label: 'second.jpg',
      signal: new AbortController().signal,
      onStatus: () => {},
    }).catch(() => {});

    await vi.waitFor(() => {
      expect(getGenerationQueueSnapshot().items.some((i) => i.jobId === 'job-2' && i.status === 'queued')).toBe(
        true,
      );
    });

    await cancelQueuedGeneration('job-2');

    expect(getGenerationQueueSnapshot().items.some((i) => i.jobId === 'job-2')).toBe(false);
    expect(submitCount).toBe(0);
  });
});