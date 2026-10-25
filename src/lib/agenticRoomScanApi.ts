import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import { agenticRoomUrl } from './agenticRoomApi';
import {
  agenticRoomAuthHeaders,
  explainAgenticRoomAuthError,
  logAgenticRoomResponse,
} from './agenticRoomAuth';
import { readAgenticRoomJson } from './agenticRoomFetch';
import {
  manifestToFurnitureList,
  parseRoomScanManifest,
  type RoomScanItemSidecar,
} from './roomScanManifest';

const ANALYZE_URL = agenticRoomUrl('/analyze');
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
      'Room scan uses Amazon Bedrock on toova-bff (/api/agentic-room/analyze). Check AWS credentials on Render.',
    ],
  };
}

export async function analyzeRoomVideoFrames(frames: string[]): Promise<RoomScanAnalyzeResult> {
  if (frames.length === 0) {
    return scanUnavailable('No video frames to analyze.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const { headers: authHeaders, diagnostics } = await agenticRoomAuthHeaders('analyze');
    const res = await fetch(ANALYZE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ frames }),
      signal: controller.signal,
    });
    const parsed = await readAgenticRoomJson<{
      ok?: boolean;
      manifest?: unknown;
      error?: string;
    }>(res);
    const apiError = parsed.error || parsed.data?.error || '';
    logAgenticRoomResponse(diagnostics, parsed.status, apiError);
    if (!parsed.ok || !parsed.data?.ok || !parsed.data.manifest) {
      return scanUnavailable(
        explainAgenticRoomAuthError(
          diagnostics,
          parsed.error || parsed.data?.error || `Analyze failed (HTTP ${parsed.status})`,
        ),
      );
    }
    const data = parsed.data;
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
    return scanUnavailable(message);
  } finally {
    clearTimeout(timer);
  }
}
