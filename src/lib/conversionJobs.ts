import { supabase } from './supabase';

export type ConversionJobSource = 'trellis' | 'upload' | 'poster';
export type ConversionJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

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
  },
): Promise<void> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    ...patch,
  };
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
