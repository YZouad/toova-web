/**
 * Web Worker entry for floor-plan ingest.
 * Message in: { id, rgba: ArrayBuffer|Uint8ClampedArray, width, height, vision? }
 * Message out: { id, ok: true, result } | { id, ok: false, error }
 */

import { ingestFloorPlanFromRgba } from './ingest';
import type { FloorPlanIngestResult, IngestVisionResult } from './types';

export interface IngestWorkerRequest {
  id: string;
  rgba: ArrayBuffer | Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  vision?: IngestVisionResult;
  inchesPerPixel?: number;
}

export type IngestWorkerResponse =
  | { id: string; ok: true; result: FloorPlanIngestResult }
  | { id: string; ok: false; error: string };

self.onmessage = (event: MessageEvent<IngestWorkerRequest>) => {
  const msg = event.data;
  try {
    const bytes =
      msg.rgba instanceof ArrayBuffer
        ? new Uint8ClampedArray(msg.rgba)
        : msg.rgba instanceof Uint8ClampedArray
          ? msg.rgba
          : new Uint8ClampedArray(msg.rgba.buffer, msg.rgba.byteOffset, msg.rgba.byteLength);
    const result = ingestFloorPlanFromRgba(bytes, msg.width, msg.height, {
      vision: msg.vision,
      inchesPerPixel: msg.inchesPerPixel,
    });
    const response: IngestWorkerResponse = { id: msg.id, ok: true, result };
    self.postMessage(response);
  } catch (err) {
    const response: IngestWorkerResponse = {
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : 'Ingest worker failed',
    };
    self.postMessage(response);
  }
};
