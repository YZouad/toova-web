export interface AgenticRoomJsonResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string;
}

function bffReachabilityHint(status: number): string {
  const base = `Agentic room API returned an empty response (HTTP ${status}).`;
  return (
    `${base} Vite proxies /api/agentic-room to TRELLIS_BFF_ORIGIN. ` +
    'Start toova-bff locally (`cd toova-bff && npm run dev`) or set TRELLIS_BFF_ORIGIN=https://toova-bff.onrender.com in .env.local.'
  );
}

function humanizeAgenticRoomError(raw: string, status: number): string {
  const trimmed = raw.trim();
  if (!trimmed || /unexpected end of json/i.test(trimmed)) {
    if (status === 500 || status === 502 || status === 503 || status === 504) {
      return bffReachabilityHint(status);
    }
    return `Agentic room API returned an empty or invalid response (HTTP ${status}). Check TRELLIS_BFF_ORIGIN and that toova-bff exposes /api/agentic-room/parse.`;
  }
  if (/bedrock:InvokeModel/i.test(trimmed) || /not authorized to perform.*bedrock/i.test(trimmed)) {
    const summary =
      'Bedrock access denied on toova-bff. Attach bedrock:InvokeModel (and model access) to the BFF IAM user for your BEDROCK_MODEL_ID inference profile.';
    const detail = trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed;
    return `${summary} AWS detail: ${detail}`;
  }
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return `Agentic room API returned HTML (HTTP ${status}). The /api/agentic-room route may be missing on the BFF you are calling.`;
  }
  return trimmed;
}

/** Read JSON from agentic-room BFF responses without throwing on empty bodies. */
export async function readAgenticRoomJson<T extends Record<string, unknown>>(
  res: Response,
): Promise<AgenticRoomJsonResult<T>> {
  const status = res.status;
  let text = '';
  try {
    text = await res.text();
  } catch {
    return {
      ok: false,
      status,
      data: null,
      error: humanizeAgenticRoomError('', status),
    };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return {
      ok: false,
      status,
      data: null,
      error: humanizeAgenticRoomError('', status),
    };
  }

  try {
    const data = JSON.parse(trimmed) as T;
    const apiError =
      typeof data.error === 'string' && data.error.trim() !== '' ? data.error.trim() : null;
    if (!res.ok) {
      return {
        ok: false,
        status,
        data,
        error: humanizeAgenticRoomError(apiError ?? `Request failed (HTTP ${status})`, status),
      };
    }
    return { ok: true, status, data, error: '' };
  } catch {
    return {
      ok: false,
      status,
      data: null,
      error: humanizeAgenticRoomError(trimmed.slice(0, 200), status),
    };
  }
}
