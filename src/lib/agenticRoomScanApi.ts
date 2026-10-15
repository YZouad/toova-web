import { supabase } from './supabase';
import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import {
  manifestToFurnitureList,
  parseRoomScanManifest,
  type RoomScanItemSidecar,
} from './roomScanManifest';

const LOCAL_ANALYZE_URL = '/api/agentic-room/analyze';
const CLIENT_TIMEOUT_MS = 120_000;

export interface RoomScanAnalyzeSuccess {
  ok: true;
  list: AgenticFurnitureListResult;
  sidecar: Record<string, RoomScanItemSidecar>;
}

export interface RoomScanAnalyzeFailure {
  ok: false;
  error: string;
  warnings: string[];
}

export type RoomScanAnalyzeResult = RoomScanAnalyzeSuccess | RoomScanAnalyzeFailure;

function scanUnavailable(message: string): RoomScanAnalyzeFailure {
  return {
    ok: false,
    error: message,
    warnings: [
      message,
      import.meta.env.DEV
        ? 'Local dev: run npm run dev:agentic with CURSOR_API_KEY in .env.local.'
        : 'Room scan requires the analyze-room-video service (CURSOR_API_KEY on Supabase).',
    ],
  };
}

async function postLocalAnalyze(frames: string[]): Promise<RoomScanAnalyzeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch(LOCAL_ANALYZE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frames }),
      signal: controller.signal,
    });
    const data = (await res.json()) as {
      ok?: boolean;
      manifest?: unknown;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.manifest) {
      const err = data.error ?? `Analyze returned ${res.status}`;
      if (import.meta.env.DEV && (res.status === 404 || err === 'Not found')) {
        return scanUnavailable(
          'Room scan API not found. Stop any old agentic proxy and run: npm run dev:agentic',
        );
      }
      return scanUnavailable(err);
    }
    const manifest = parseRoomScanManifest(data.manifest);
    if (!manifest) {
      return scanUnavailable('Vision output was not a valid room scan.');
    }
    const mapped = manifestToFurnitureList(manifest);
    return { ok: true, ...mapped };
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === 'AbortError'
        ? 'Room scan timed out.'
        : err instanceof Error
          ? err.message
          : 'Network error';
    if (import.meta.env.DEV && /fetch|ECONNREFUSED|Failed to fetch/i.test(message)) {
      return scanUnavailable(
        'Cannot reach the room scan proxy. Run: npm run dev:agentic (with CURSOR_API_KEY in .env.local).',
      );
    }
    return scanUnavailable(message);
  } finally {
    clearTimeout(timer);
  }
}

async function postSupabaseAnalyze(frames: string[]): Promise<RoomScanAnalyzeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const { data, error } = await supabase.functions.invoke('analyze-room-video', {
      body: { frames },
    });
    if (error) {
      return scanUnavailable(error.message);
    }
    const payload = data as { ok?: boolean; manifest?: unknown; error?: string };
    if (!payload?.ok || !payload.manifest) {
      return scanUnavailable(payload?.error ?? 'Room scan analyze failed.');
    }
    const manifest = parseRoomScanManifest(payload.manifest);
    if (!manifest) {
      return scanUnavailable('Vision output was not a valid room scan.');
    }
    const mapped = manifestToFurnitureList(manifest);
    return { ok: true, ...mapped };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    return scanUnavailable(message);
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeRoomVideoFrames(frames: string[]): Promise<RoomScanAnalyzeResult> {
  if (frames.length === 0) {
    return scanUnavailable('No video frames to analyze.');
  }
  if (import.meta.env.DEV) {
    return postLocalAnalyze(frames);
  }
  return postSupabaseAnalyze(frames);
}
