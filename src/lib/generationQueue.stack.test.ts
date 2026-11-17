import { beforeEach, describe, expect, it, vi } from 'vitest';

const ids = vi.hoisted(() => ({ n: 0, submit: 0 }));
const completion = vi.hoisted(() => ({
  completed: new Set<string>(),
}));

vi.mock('./analytics', () => ({
  trackModelGenerationFailed: vi.fn(),
  trackModelGenerationStarted: vi.fn(),
  trackCreditsSpent: vi.fn(),
  trackModelGenerationSucceeded: vi.fn(),
}));

vi.mock('./conversionJobs', () => ({
  createConversionJob: vi.fn(async () => `job-${++ids.n}`),
  failInterruptedConversionJob: vi.fn(),
  fetchConversionJob: vi.fn(async (jobId: string) => {
    if (completion.completed.has(jobId)) {
      return {
        id: jobId,
        status: 'completed',
        result_path: `${jobId}/result.glb`,
        error: null,
      };
    }
    return { id: jobId, status: 'processing', result_path: null, error: null };
  }),
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
          await new Promise((r) => setTimeout(r, 250));
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
    ids.submit += 1;
    const body = JSON.parse(String(init.body)) as { job_id: string };
    completion.completed.add(body.job_id);
    return new Response('', { status: 202 });
  }
  if (url === 'https://example.test/result.glb') {
    return new Response(new Blob(['glb']), { status: 200 });
  }
  return new Response('not found', { status: 404 });
}) as typeof fetch;

describe('generation queue stack', () => {
  beforeEach(() => {
    ids.n = 0;
    ids.submit = 0;
    completion.completed.clear();
    vi.clearAllMocks();
    vi.stubGlobal('window', { addEventListener: vi.fn() });
  });

  it('drains two queued jobs in order', async () => {
    const { enqueuePhotoGenerate, getGenerationQueueSnapshot, resetGenerationQueueForTests } =
      await import('./generationQueue');
    resetGenerationQueueForTests();

    const mkFile = (name: string) => new File([new Blob(['img'])], name, { type: 'image/jpeg' });

    const first = enqueuePhotoGenerate({
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

    void first;

    await vi.waitFor(() => {
      expect(
        getGenerationQueueSnapshot().items.some((i) => i.jobId === 'job-2' && i.status === 'queued'),
      ).toBe(true);
    });

    await vi.waitFor(() => expect(ids.submit).toBe(2), { timeout: 15000, interval: 100 });
    expect(completion.completed.has('job-1')).toBe(true);
    expect(completion.completed.has('job-2')).toBe(true);
  });
});