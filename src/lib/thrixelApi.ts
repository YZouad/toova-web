import { supabase } from './supabase';

const raw = import.meta.env.VITE_THRIXEL_API_URL;
const defaultProductionBff = 'https://toova-bff.onrender.com/api/thrixel';

/** Dev: same-origin /api/thrixel (Vite → BFF). Prod: explicit env or Render BFF default. */
export const THRIXEL_API_URL =
  typeof raw === 'string' && raw.trim() !== ''
    ? raw.trim().replace(/\/$/, '')
    : import.meta.env.PROD
      ? defaultProductionBff
      : '/api/thrixel';

export const THRIXEL_STATUS_POLL_MS = 4000;
export const THRIXEL_READY_TIMEOUT_MS = 15 * 60 * 1000;

export type ThrixelJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ThrixelConnectionStatus {
  connected: boolean;
  connectedAt?: string;
}

export interface ThrixelSubmissionInfo {
  submission_id: string;
  status: ThrixelJobStatus;
  error?: string | null;
}

async function thrixelAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Sign in to use Thrixel.');
  }
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
  };
}

function extractErrorText(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim();
  } catch {
    /* keep raw */
  }
  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed;
}

export async function fetchThrixelConnectionStatus(): Promise<ThrixelConnectionStatus> {
  const headers = await thrixelAuthHeaders();
  const res = await fetch(`${THRIXEL_API_URL}/connection`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorText(text, 'Could not load Thrixel connection.'));
  }
  const data = (await res.json()) as ThrixelConnectionStatus;
  return {
    connected: Boolean(data.connected),
    connectedAt: typeof data.connectedAt === 'string' ? data.connectedAt : undefined,
  };
}

export async function connectThrixel(apiKey: string): Promise<ThrixelConnectionStatus> {
  const headers = await thrixelAuthHeaders();
  const res = await fetch(`${THRIXEL_API_URL}/connect`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey: apiKey.trim() }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorText(text, 'Could not connect Thrixel.'));
  }
  const data = (await res.json()) as ThrixelConnectionStatus;
  return {
    connected: Boolean(data.connected),
    connectedAt: typeof data.connectedAt === 'string' ? data.connectedAt : undefined,
  };
}

export async function disconnectThrixel(): Promise<void> {
  const headers = await thrixelAuthHeaders();
  const res = await fetch(`${THRIXEL_API_URL}/connect`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorText(text, 'Could not disconnect Thrixel.'));
  }
}

export async function submitThrixelGeneration(input: {
  task?: string;
  imageDataUrl?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const headers = await thrixelAuthHeaders();
  const body: Record<string, string> = {};
  if (input.task?.trim()) body.task = input.task.trim();
  if (input.imageDataUrl?.trim()) body.image = input.imageDataUrl.trim();
  if (!body.task && !body.image) {
    throw new Error('Provide a description or a reference image.');
  }

  const res = await fetch(`${THRIXEL_API_URL}/submit`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: input.signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorText(text, 'Thrixel submission failed.'));
  }
  const data = (await res.json()) as { submission_id?: string };
  if (!data.submission_id) {
    throw new Error('Thrixel did not return a submission id.');
  }
  return data.submission_id;
}

function normalizeThrixelJobStatus(raw: unknown, submissionId: string): ThrixelSubmissionInfo {
  const data = raw as {
    submission_id?: string;
    status?: string;
    error?: string;
    error_message?: string;
  };
  const statusRaw = String(data.status ?? 'processing');
  const status: ThrixelJobStatus =
    statusRaw === 'completed' ||
    statusRaw === 'failed' ||
    statusRaw === 'queued' ||
    statusRaw === 'processing'
      ? statusRaw
      : statusRaw === 'timeout'
        ? 'failed'
        : 'processing';
  const error =
    (typeof data.error === 'string' && data.error.trim()) ||
    (typeof data.error_message === 'string' && data.error_message.trim()) ||
    null;
  return {
    submission_id: data.submission_id || submissionId,
    status,
    error,
  };
}

export async function fetchThrixelPricing(): Promise<unknown> {
  const res = await fetch(`${THRIXEL_API_URL}/pricing`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorText(text, 'Could not load Thrixel pricing.'));
  }
  return res.json();
}

export async function fetchThrixelAccount(): Promise<unknown> {
  const headers = await thrixelAuthHeaders();
  const res = await fetch(`${THRIXEL_API_URL}/account`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorText(text, 'Could not load Thrixel account.'));
  }
  return res.json();
}

export type ThrixelRevisionOp = 'edit' | 'autofix' | 'retexture' | 'detail' | 'reduce';

export async function submitThrixelRevision(input: {
  submissionId: string;
  op: ThrixelRevisionOp;
  change?: string;
  prompt?: string;
  targetTriangles?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const headers = await thrixelAuthHeaders();
  const id = encodeURIComponent(input.submissionId);
  let path = '';
  let body: Record<string, unknown> = {};

  switch (input.op) {
    case 'edit':
      path = `/jobs/${id}/edit`;
      body = { change: input.change?.trim() ?? '' };
      if (!body.change) throw new Error('Describe what should change.');
      break;
    case 'autofix':
      path = `/jobs/${id}/autofix`;
      break;
    case 'retexture':
      path = `/jobs/${id}/retexture`;
      if (input.prompt?.trim()) body = { prompt: input.prompt.trim() };
      break;
    case 'detail':
      path = `/jobs/${id}/detail`;
      if (input.prompt?.trim()) body = { prompt: input.prompt.trim() };
      break;
    case 'reduce': {
      path = `/jobs/${id}/reduce`;
      const target = input.targetTriangles;
      if (!Number.isFinite(target) || (target ?? 0) < 100) {
        throw new Error('Choose a valid triangle budget.');
      }
      body = { target_triangles: target };
      break;
    }
  }

  const res = await fetch(`${THRIXEL_API_URL}${path}`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: input.signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorText(text, 'Thrixel submission failed.'));
  }
  const data = (await res.json()) as { submission_id?: string };
  if (!data.submission_id) {
    throw new Error('Thrixel did not return a submission id.');
  }
  return data.submission_id;
}

export async function fetchThrixelJobStatus(
  submissionId: string,
  signal?: AbortSignal,
): Promise<ThrixelSubmissionInfo> {
  const headers = await thrixelAuthHeaders();
  const res = await fetch(`${THRIXEL_API_URL}/jobs/${encodeURIComponent(submissionId)}/status`, {
    headers,
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorText(text, 'Could not load job status.'));
  }
  const data = await res.json();
  return normalizeThrixelJobStatus(data, submissionId);
}

export async function downloadThrixelGlb(
  submissionId: string,
  signal?: AbortSignal,
): Promise<File> {
  const headers = await thrixelAuthHeaders();
  const res = await fetch(`${THRIXEL_API_URL}/jobs/${encodeURIComponent(submissionId)}/download`, {
    headers,
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorText(text, 'Could not download model.'));
  }
  const blob = await res.blob();
  if (blob.size === 0) {
    throw new Error('Thrixel returned an empty model file.');
  }
  return new File([blob], 'generated.glb', {
    type: blob.type || 'model/gltf-binary',
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export async function waitForThrixelJob(
  submissionId: string,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<void> {
  const started = Date.now();
  onProgress?.('Queued with Thrixel…');

  while (true) {
    throwIfAborted(signal);
    if (Date.now() - started > THRIXEL_READY_TIMEOUT_MS) {
      throw new Error('Thrixel generation timed out.');
    }

    const info = await fetchThrixelJobStatus(submissionId, signal);
    if (info.status === 'completed') {
      onProgress?.('Generation complete.');
      return;
    }
    if (info.status === 'failed') {
      throw new Error(info.error?.trim() || 'Thrixel generation failed.');
    }

    onProgress?.(
      info.status === 'processing' ? 'Thrixel is generating your model…' : 'Waiting in Thrixel queue…',
    );
    await sleep(THRIXEL_STATUS_POLL_MS, signal);
  }
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read image file.'));
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}
