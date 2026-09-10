import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase';

export type ConversionJobSource = 'trellis' | 'thrixel' | 'upload' | 'poster';
export type ConversionJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export const INTERRUPTED_GENERATION_ERROR =
  'Interrupted — closed before generation finished.';

export type OpenConversionJob = {
  id: string;
  status: ConversionJobStatus;
  source: ConversionJobSource;
  label: string | null;
  updated_at: string;
};

const STALE_PROCESSING_MS = 20 * 60 * 1000;

export async function createConversionJob(input: {
  userId: string;
  source: ConversionJobSource;
  status?: ConversionJobStatus;
  label?: string | null;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('conversion_jobs')
    .insert({
      user_id: input.userId,
      source: input.source,
      status: input.status ?? 'processing',
      label: input.label ?? null,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.warn('[conversion_jobs] create failed', error.message);
    return null;
  }
  return data?.id ? String(data.id) : null;
}

export async function updateConversionJob(
  jobId: string,
  patch: {
    status?: ConversionJobStatus;
    error?: string | null;
    kind?: string | null;
    label?: string | null;
    thrixelSubmissionId?: string | null;
  },
): Promise<void> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    status: patch.status,
    error: patch.error,
    kind: patch.kind,
    label: patch.label,
  };
  if (patch.thrixelSubmissionId !== undefined) {
    payload.thrixel_submission_id = patch.thrixelSubmissionId;
  }
  if (patch.status === 'completed' || patch.status === 'failed') {
    payload.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('conversion_jobs')
    .update(payload)
    .eq('id', jobId);

  if (error) {
    console.warn('[conversion_jobs] update failed', error.message);
  }
}

export async function listOpenTrellisJobs(userId: string): Promise<OpenConversionJob[]> {
  const { data, error } = await supabase
    .from('conversion_jobs')
    .select('id,status,source,label,updated_at')
    .eq('user_id', userId)
    .eq('source', 'trellis')
    .in('status', ['queued', 'processing']);

  if (error) {
    console.warn('[conversion_jobs] list open failed', error.message);
    return [];
  }

  return ((data ?? []) as Partial<OpenConversionJob>[]).map((row) => ({
    id: String(row.id ?? ''),
    status: (row.status === 'queued' || row.status === 'processing' ? row.status : 'processing') as ConversionJobStatus,
    source: 'trellis' as const,
    label: row.label != null ? String(row.label) : null,
    updated_at: String(row.updated_at ?? ''),
  })).filter((row) => row.id);
}

/** Best-effort status write that can run during tab close. */
export function keepaliveUpdateConversionJob(
  jobId: string,
  accessToken: string | null,
  patch: { status: ConversionJobStatus; error?: string | null },
): void {
  if (!accessToken) return;
  const payload: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  };
  if (patch.status === 'completed' || patch.status === 'failed') {
    payload.completed_at = new Date().toISOString();
  }
  void fetch(`${SUPABASE_URL}/rest/v1/conversion_jobs?id=eq.${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    keepalive: true,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export async function failInterruptedConversionJob(jobId: string): Promise<void> {
  await updateConversionJob(jobId, {
    status: 'failed',
    error: INTERRUPTED_GENERATION_ERROR,
  });
}

export async function failStaleProcessingJobsAsAdmin(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data, error } = await supabase.rpc('fail_stale_conversion_jobs', { p_minutes: 20 });
  if (!error && typeof data === 'number') return data;
  const fallback = await supabase
    .from('conversion_jobs')
    .update({
      status: 'failed',
      error: INTERRUPTED_GENERATION_ERROR,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq('status', 'processing')
    .lt('updated_at', cutoff)
    .select('id');
  if (fallback.error) return 0;
  return fallback.data?.length ?? 0;
}
