/**
 * Room scan via Cursor Cloud Agents API (same CURSOR_API_KEY as /parse).
 * Up to 5 JPEG images per agent create (Cursor API limit).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const CURSOR_ROOM_SCAN_MAX_IMAGES = 5;
export const CURSOR_ROOM_SCAN_TIMEOUT_MS = 120_000;

export function loadRoomScanVisionPrompt() {
  const schemaPath = path.join(ROOT, 'src/lib/roomScanVisionPrompt.ts');
  try {
    const raw = readFileSync(schemaPath, 'utf8');
    const m = raw.match(/export const ROOM_SCAN_VISION_PROMPT = `([\s\S]*?)`;/);
    if (m) return m[1];
  } catch {
    /* fallback */
  }
  return 'Return room scan JSON with widthIn, depthIn, items[].';
}

export function sampleFramesForCursor(frames, max = CURSOR_ROOM_SCAN_MAX_IMAGES) {
  if (frames.length <= max) return frames;
  const out = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.min(frames.length - 1, Math.floor(((i + 0.5) * frames.length) / max));
    out.push(frames[idx]);
  }
  return out;
}

export function dataUrlToCursorImage(dataUrl) {
  const s = String(dataUrl ?? '').trim();
  const m = s.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/i);
  if (m) {
    return { data: m[2], mimeType: m[1].toLowerCase() };
  }
  const raw = s.replace(/^data:image\/\w+;base64,/i, '');
  return { data: raw, mimeType: 'image/jpeg' };
}

export function extractJsonFromAgentText(text) {
  const trimmed = String(text ?? '').trim();
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

function extractRunText(run) {
  if (!run || typeof run !== 'object') return '';
  if (typeof run.result === 'string') return run.result;
  if (typeof run.text === 'string') return run.text;
  if (run.result && typeof run.result === 'object' && typeof run.result.text === 'string') {
    return run.result.text;
  }
  const messages = run.messages ?? run.output?.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const text = msg?.text ?? msg?.content ?? msg?.output;
    if (typeof text === 'string' && text.trim()) return text;
  }
  return '';
}

export async function runCursorRoomScanAgent(cursorFetch, apiKey, frames, options = {}) {
  const timeoutMs = options.timeoutMs ?? CURSOR_ROOM_SCAN_TIMEOUT_MS;
  const sampled = sampleFramesForCursor(frames);
  const images = sampled.map(dataUrlToCursorImage);
  const frameNote = `\n\nYou receive ${sampled.length} image(s), indexed 0 through ${sampled.length - 1} in order.`;
  const promptText = loadRoomScanVisionPrompt() + frameNote;

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
  const agentId = created.agent?.id;
  const runId = created.run?.id;
  if (!agentId || !runId) {
    throw new Error('Cursor response missing agent or run id');
  }

  const pollMs = options.pollMs ?? 2000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const runRes = await cursorFetch(apiKey, `/agents/${agentId}/runs/${runId}`);
    if (!runRes.ok) {
      const errText = await runRes.text();
      throw new Error(`Cursor poll failed (${runRes.status}): ${errText.slice(0, 200)}`);
    }
    const run = await runRes.json();
    const status = String(run.status ?? '').toUpperCase();
    if (status === 'FINISHED' || status === 'COMPLETED' || status === 'SUCCEEDED') {
      const text = extractRunText(run);
      if (!text.trim()) throw new Error('Cursor agent finished with empty text');
      const json = extractJsonFromAgentText(text);
      if (!json) {
        throw new Error('Could not parse room scan JSON from Cursor agent response.');
      }
      return json;
    }
    if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
      throw new Error(`Cursor agent run ${status.toLowerCase()}`);
    }
  }

  throw new Error(`Cursor room scan timed out after ${Math.round(timeoutMs / 1000)}s`);
}
