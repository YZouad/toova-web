import type { RoomEnvironment } from '../store';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrapDeg = (deg: number) => ((deg % 360) + 360) % 360;

export function parseEnvironment(raw: unknown): RoomEnvironment | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.timeOfDay !== 'number') return null;
  if (typeof o.orientationDeg !== 'number') return null;
  if (typeof o.exposure !== 'number') return null;
  if (o.skyMode !== 'gradient' && o.skyMode !== 'studio') return null;
  return {
    timeOfDay: clamp(o.timeOfDay, 0, 24),
    orientationDeg: wrapDeg(o.orientationDeg),
    exposure: clamp(o.exposure, 0.2, 3),
    skyMode: o.skyMode,
    godRays: o.godRays === true,
  };
}
