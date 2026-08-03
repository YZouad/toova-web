import type { Weather } from './environment';
import type { RoomEnvironment } from '../store';
import { DEFAULT_APPEARANCE, parseAppearance, type RoomAppearance } from './roomAppearance';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrapDeg = (deg: number) => ((deg % 360) + 360) % 360;

const WEATHER_VALUES: Weather[] = ['clear', 'partlyCloudy', 'overcast', 'foggy', 'rain', 'snow'];

function parseWeather(raw: unknown): Weather {
  if (typeof raw === 'string' && (WEATHER_VALUES as string[]).includes(raw)) {
    return raw as Weather;
  }
  return 'partlyCloudy';
}

/**
 * Field-tolerant environment parse. Missing fields fall back to defaults
 * instead of rejecting the whole payload (older rooms stay warm-neutral).
 */
export function parseEnvironment(raw: unknown): RoomEnvironment | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const timeOfDay = typeof o.timeOfDay === 'number' ? clamp(o.timeOfDay, 0, 24) : 13;
  const orientationDeg =
    typeof o.orientationDeg === 'number' ? wrapDeg(o.orientationDeg) : 0;
  const exposure = typeof o.exposure === 'number' ? clamp(o.exposure, 0.2, 3) : 1;
  const skyMode = o.skyMode === 'studio' ? 'studio' : 'gradient';

  const appearance: RoomAppearance = o.appearance
    ? parseAppearance(o.appearance)
    : { ...DEFAULT_APPEARANCE };

  return {
    timeOfDay,
    orientationDeg,
    exposure,
    skyMode,
    weather: parseWeather(o.weather),
    godRays: o.godRays === true,
    shadowRoof: o.shadowRoof === undefined ? true : o.shadowRoof === true,
    appearance,
  };
}

export function serializeEnvironment(env: RoomEnvironment): Record<string, unknown> {
  return {
    timeOfDay: env.timeOfDay,
    orientationDeg: env.orientationDeg,
    exposure: env.exposure,
    skyMode: env.skyMode,
    weather: env.weather,
    godRays: env.godRays,
    shadowRoof: env.shadowRoof,
    appearance: env.appearance,
  };
}
