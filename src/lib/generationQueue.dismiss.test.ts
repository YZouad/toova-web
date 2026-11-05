import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateConversionJob, deleteGenerationAsset, listReadyTrellisJobs, listGenerationAssets } =
  vi.hoisted(() => ({
    updateConversionJob: vi.fn(async () => {}),
    deleteGenerationAsset: vi.fn(async () => {}),
    listReadyTrellisJobs: vi.fn(async () => [
      {
        id: 'job-1',
        status: 'completed' as const,
        source: 'trellis' as const,
        label: 'Lamp',
        updated_at: '2026-11-04T00:00:00.000Z',
        result_path: 'user/jobs/job-1/result.glb',
        server_owned: true,
      },
    ]),
    listGenerationAssets: vi.fn(async () => [
      {
        jobId: 'job-1',
        userId: 'user-1',
        label: 'Lamp',
        kind: 'result' as const,
        blob: new Blob(['glb']),
        fileName: 'generated.glb',
        type: 'model/gltf-binary',
      },
    ]),
  }));

vi.mock('./analytics', () => ({
  trackModelGenerationFailed: vi.fn(),
  trackModelGenerationStarted: vi.fn(),
  trackCreditsSpent: vi.fn(),
  trackModelGenerationSucceeded: vi.fn(),
}));

vi.mock('./conversionJobs', () => ({
  createConversionJob: vi.fn(),
  failInterruptedConversionJob: vi.fn(),
  fetchConversionJob: vi.fn(),
  keepaliveUpdateConversionJob: vi.fn(),
  listOpenTrellisJobs: vi.fn(async () => []),
  listReadyTrellisJobs,
  updateConversionJob,
}));

vi.mock('./generationQueueStore', () => ({
  deleteGenerationAsset,
  fileFromAsset: (record: { blob: Blob; fileName: string; type: string }) =>
    new File([record.blob], record.fileName, { type: record.type }),
  listGenerationAssets,
  putGenerationAsset: vi.fn(),
}));

vi.mock('./modelStorage', () => ({
  MODEL_FILES_BUCKET: 'model-files',
  signModelObjectPath: vi.fn(async () => null),
}));

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  SUPABASE_PUBLISHABLE_KEY: 'test',
  SUPABASE_URL: 'https://example.supabase.co',
}));

vi.mock('./trellisAuth', () => ({ trellisAuthHeaders: vi.fn(async () => ({})) }));
vi.mock('./trellisApi', () => ({ trellisSiblingUrl: (path: string) => path }));
vi.mock('./webpToJpeg', () => ({ ensureJpegForTrellis: vi.fn() }));
vi.mock('./trellisGenerate', () => ({ generateGlbFromPhoto: vi.fn() }));

function installStorage() {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  const make = (store: Map<string, string>): Storage => ({
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  });
  vi.stubGlobal('localStorage', make(local));
  vi.stubGlobal('sessionStorage', make(session));
  vi.stubGlobal('window', { addEventListener: vi.fn() });
}

describe('generation queue dismiss', () => {
  beforeEach(() => {
    updateConversionJob.mockClear();
    deleteGenerationAsset.mockClear();
    installStorage();
  });

  it('keeps a dismissed ready model hidden after reload', async () => {
    const { dismissGenerationQueueItem, getGenerationQueueSnapshot, recoverGenerationQueue } =
      await import('./generationQueue');

    await dismissGenerationQueueItem('job-1');
    await recoverGenerationQueue('user-1');

    expect(getGenerationQueueSnapshot().items).toEqual([]);
    expect(localStorage.getItem('toova-dismissed-ready-jobs')).toContain('job-1');
    expect(updateConversionJob).toHaveBeenCalledWith('job-1', { server_owned: false });
    expect(deleteGenerationAsset).toHaveBeenCalledWith('job-1');
  });
});
