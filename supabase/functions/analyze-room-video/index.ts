/**
 * Room scan via Cursor Cloud Agents API (CURSOR_API_KEY secret).
 * verify_jwt = false (anon key + rate limit).
 */

import { ROOM_SCAN_VISION_PROMPT } from './roomScanVisionPrompt.ts';

const CURSOR_API = 'https://api.cursor.com/v1';
const MAX_FRAMES = 12;
const MAX_PAYLOAD_CHARS = 18_000_000;
const RATE_LIMIT_PER_MINUTE = 8;
const CURSOR_MAX_IMAGES = 5;
const SCAN_TIMEOUT_MS = 120_000;
const POLL_MS = 2000;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function sampleFrames(frames: string[], max = CURSOR_MAX_IMAGES): string[] {
  if (frames.length <= max) return frames;
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.min(frames.length - 1, Math.floor(((i + 0.5) * frames.length) / max));
    out.push(frames[idx]!);
  }
  return out;
}

function dataUrlToCursorImage(dataUrl: string): { data: string; mimeType: string } {
  const s = dataUrl.trim();
  const m = s.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/i);
  if (m) return { data: m[2]!, mimeType: m[1]!.toLowerCase() };
  const raw = s.replace(/^data:image\/\w+;base64,/i, '');
  return { data: raw, mimeType: 'image/jpeg' };
}

function extractJsonFromAgentText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function extractRunText(run: Record<string, unknown>): string {
  if (typeof run.result === 'string') return run.result;
  if (typeof run.text === 'string') return run.text;
  const resultObj = run.result;
  if (resultObj && typeof resultObj === 'object' && typeof (resultObj as { text?: string }).text === 'string') {
    return (resultObj as { text: string }).text;
  }
  const messages = (run.messages ?? (run.output as Record<string, unknown>)?.messages) as
    | Array<Record<string, unknown>>
    | undefined;
  if (Array.isArray(messages)) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const text = msg?.text ?? msg?.content ?? msg?.output;
      if (typeof text === 'string' && text.trim()) return text;
    }
  }
  return '';
}

async function cursorFetch(apiKey: string, pathname: string, init?: RequestInit): Promise<Response> {
  const auth = btoa(`${apiKey}:`);
  return fetch(`${CURSOR_API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function runCursorRoomScan(apiKey: string, frames: string[]): Promise<unknown> {
  const sampled = sampleFrames(frames);
  const images = sampled.map(dataUrlToCursorImage);
  const promptText =
    ROOM_SCAN_VISION_PROMPT +
    `\n\nYou receive ${sampled.length} image(s), indexed 0 through ${sampled.length - 1} in order.`;

  const createRes = await cursorFetch(apiKey, '/agents', {
    method: 'POST',
    body: JSON.stringify({
      prompt: { text: promptText, images },
      model: { id: 'composer-2.5' },
    }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Cursor create failed (${createRes.status}): ${errText.slice(0, 300)}`);
  }
  const created = await createRes.json();
  const agentId = created.agent?.id as string | undefined;
  const runId = created.run?.id as string | undefined;
  if (!agentId || !runId) throw new Error('Cursor response missing agent or run id');

  const deadline = Date.now() + SCAN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const runRes = await cursorFetch(apiKey, `/agents/${agentId}/runs/${runId}`);
    if (!runRes.ok) {
      const errText = await runRes.text();
      throw new Error(`Cursor poll failed (${runRes.status}): ${errText.slice(0, 200)}`);
    }
    const run = (await runRes.json()) as Record<string, unknown>;
    const status = String(run.status ?? '').toUpperCase();
    if (status === 'FINISHED' || status === 'COMPLETED' || status === 'SUCCEEDED') {
      const text = extractRunText(run);
      if (!text.trim()) throw new Error('Cursor agent finished with empty text');
      const parsed = extractJsonFromAgentText(text);
      if (!parsed) throw new Error('Could not parse room scan JSON from Cursor agent.');
      return parsed;
    }
    if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
      throw new Error(`Cursor agent run ${status.toLowerCase()}`);
    }
  }
  throw new Error('Cursor room scan timed out');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed.' }, 405);
  }

  try {
    const apiKey = requireEnv('CURSOR_API_KEY');
    const body = await req.json().catch(() => null);
    const frames = Array.isArray(body?.frames) ? body.frames.map(String) : [];
    if (frames.length === 0) {
      return json({ ok: false, error: 'At least one frame is required.' }, 400);
    }
    if (frames.length > MAX_FRAMES) {
      return json({ ok: false, error: 'Too many frames (max 12).' }, 400);
    }
    const totalChars = frames.reduce((n, f) => n + f.length, 0);
    if (totalChars > MAX_PAYLOAD_CHARS) {
      return json({ ok: false, error: 'Frames payload is too large.' }, 413);
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('cf-connecting-ip') ??
      'unknown';
    const bucketKey = `room-scan:${ip}`;
    const now = Date.now();
    const store = (globalThis as { __roomScanRate?: Map<string, number[]> }).__roomScanRate ??=
      new Map<string, number[]>();
    const windowMs = 60_000;
    const prev = (store.get(bucketKey) ?? []).filter((t) => now - t < windowMs);
    if (prev.length >= RATE_LIMIT_PER_MINUTE) {
      return json({ ok: false, error: 'Rate limit exceeded. Try again in a minute.' }, 429);
    }
    prev.push(now);
    store.set(bucketKey, prev);

    const manifest = await runCursorRoomScan(apiKey, frames);
    return json({ ok: true, manifest });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analyze failed';
    return json({ ok: false, error: message }, 502);
  }
});
