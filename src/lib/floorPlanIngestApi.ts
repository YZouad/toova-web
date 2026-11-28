import { agenticRoomUrl } from './agenticRoomApi';
import {
  agenticRoomAuthHeaders,
  explainAgenticRoomAuthError,
  logAgenticRoomResponse,
} from './agenticRoomAuth';
import { readAgenticRoomJson } from './agenticRoomFetch';
import { isRoomTag } from './roomTags';
import type { IngestVisionResult } from './floorPlanIngest';

const FLOORPLAN_URL = agenticRoomUrl('/floorplan');
const CLIENT_TIMEOUT_MS = 120_000;

export interface FloorPlanVisionSuccess {
  ok: true;
  vision: IngestVisionResult;
}

export interface FloorPlanVisionFailure {
  ok: false;
  error: string;
  warnings: string[];
}

export type FloorPlanVisionResult = FloorPlanVisionSuccess | FloorPlanVisionFailure;

function unavailable(message: string): FloorPlanVisionFailure {
  return {
    ok: false,
    error: message,
    warnings: [
      message,
      'Floor plan vision uses Amazon Bedrock on toova-bff (/api/agentic-room/floorplan).',
    ],
  };
}

function parseVision(raw: unknown): IngestVisionResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const facesRaw = Array.isArray(o.faces) ? o.faces : [];
  const gapsRaw = Array.isArray(o.gaps) ? o.gaps : [];
  const dimsRaw = Array.isArray(o.dimensions) ? o.dimensions : [];

  const faces = facesRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const r = entry as Record<string, unknown>;
      if (typeof r.id !== 'string') return null;
      const tag = typeof r.tag === 'string' && isRoomTag(r.tag) ? r.tag : undefined;
      return {
        id: r.id,
        label: typeof r.label === 'string' ? r.label : undefined,
        tag,
        interior: typeof r.interior === 'boolean' ? r.interior : undefined,
        widthIn: typeof r.widthIn === 'number' ? r.widthIn : undefined,
        depthIn: typeof r.depthIn === 'number' ? r.depthIn : undefined,
        areaSqFt: typeof r.areaSqFt === 'number' ? r.areaSqFt : undefined,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f != null);

  const gaps = gapsRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const r = entry as Record<string, unknown>;
      if (typeof r.id !== 'string') return null;
      const kind = r.kind;
      if (kind !== 'door' && kind !== 'window' && kind !== 'opening' && kind !== 'none') {
        return null;
      }
      return { id: r.id, kind: kind as 'door' | 'window' | 'opening' | 'none' };
    })
    .filter((g): g is NonNullable<typeof g> => g != null);

  const dimensions = dimsRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const r = entry as Record<string, unknown>;
      if (typeof r.text !== 'string') return null;
      return {
        text: r.text,
        inches: typeof r.inches === 'number' ? r.inches : undefined,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d != null);

  const units = o.units === 'metric' || o.units === 'imperial' ? o.units : undefined;
  return { faces, gaps, dimensions, units };
}

/**
 * Ask the BFF vision model to label numbered faces/gaps and read dimensions.
 * Vision is optional — callers should proceed with geometry-only ingest on failure.
 */
export async function analyzeFloorPlanVision(input: {
  imageDataUrl: string;
  overlayDataUrl: string;
  faceIds: string[];
  gapIds: string[];
}): Promise<FloorPlanVisionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const { headers: authHeaders, diagnostics } = await agenticRoomAuthHeaders('floorplan');
    const res = await fetch(FLOORPLAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        image: input.imageDataUrl,
        overlay: input.overlayDataUrl,
        faceIds: input.faceIds,
        gapIds: input.gapIds,
      }),
      signal: controller.signal,
    });
    const parsed = await readAgenticRoomJson<{
      ok?: boolean;
      vision?: unknown;
      error?: string;
    }>(res);
    const apiError = parsed.error || parsed.data?.error || '';
    logAgenticRoomResponse(diagnostics, parsed.status, apiError);
    if (!parsed.ok || !parsed.data?.ok || !parsed.data.vision) {
      return unavailable(
        explainAgenticRoomAuthError(
          diagnostics,
          parsed.error || parsed.data?.error || `Floor plan vision failed (HTTP ${parsed.status})`,
        ),
      );
    }
    const vision = parseVision(parsed.data.vision);
    if (!vision) {
      return unavailable('Vision output was not a valid floor plan label set.');
    }
    return { ok: true, vision };
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === 'AbortError'
        ? 'Floor plan vision timed out.'
        : err instanceof Error
          ? err.message
          : 'Network error';
    return unavailable(message);
  } finally {
    clearTimeout(timer);
  }
}
