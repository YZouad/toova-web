export interface SunSample {
  position: [number, number, number];
  color: string;
  intensity: number;
  skyColor: string;
  groundColor: string;
  ambient: number;
  skyTop: string;
  skyBottom: string;
  glassTint: string;
}

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Sun is above the horizon roughly 06:00-20:00 (midpoint = solar noon at 13:00).
const SUNRISE = 6;
const SUNSET = 20;
const DAY_SPAN = SUNSET - SUNRISE; // 14h
const MAX_ELEVATION = 62; // degrees at solar noon

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lerpHex(a: string, b: string, t: number): string {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  const k = clamp(t, 0, 1);
  return rgbToHex(
    ar[0] + (br[0] - ar[0]) * k,
    ar[1] + (br[1] - ar[1]) * k,
    ar[2] + (br[2] - ar[2]) * k,
  );
}

/**
 * Pure time-of-day -> lighting model. Everything visual (sun direction, color,
 * intensity, hemisphere fill, sky gradient, window tint) is derived here so the
 * scene stays coherent across the day. No three.js imports — plain hex/number out.
 */
export function sampleSun(
  timeOfDay: number,
  orientationDeg: number,
  roomSize?: { width: number; depth: number },
): SunSample {
  const rw = roomSize?.width ?? 101;
  const rd = roomSize?.depth ?? 180;
  const h = clamp(timeOfDay, 0, 24);

  // Elevation: a sine peaking at solar noon, going negative (below horizon) at night.
  const dayPhase = (h - SUNRISE) / DAY_SPAN; // 0 at sunrise, 1 at sunset, outside range at night
  const elevationDeg = MAX_ELEVATION * Math.sin(dayPhase * Math.PI);

  // Azimuth sweeps east -> south -> west across the day, offset by room orientation.
  const azimuthDeg = 90 + 180 * dayPhase + orientationDeg;

  const elevRad = elevationDeg * DEG;
  const azRad = azimuthDeg * DEG;

  // Place the sun on a dome around the room center; below floor at night.
  const radius = rd + 200;
  const cx = rw / 2;
  const cz = rd / 2;
  const horiz = radius * Math.cos(elevRad);
  const position: [number, number, number] = [
    cx + horiz * Math.cos(azRad),
    radius * Math.sin(elevRad),
    cz + horiz * Math.sin(azRad),
  ];

  const sunUp = elevationDeg > 0;
  const dayFrac = clamp(elevationDeg / MAX_ELEVATION, 0, 1); // 0 at horizon, 1 at peak
  const goldenFrac = sunUp ? clamp(1 - elevationDeg / 12, 0, 1) : 0; // 1 near horizon
  const nightFrac = clamp(-elevationDeg / 18, 0, 1); // 0 at horizon, 1 deep night

  // Intensity: faint cool moonlight at night, ramping to ~1.4 at noon.
  const intensity = sunUp ? 0.12 + 1.28 * Math.pow(dayFrac, 0.6) : 0.07;

  // Sun color: golden near the horizon, neutral warm-white high up, cool/blue at night.
  const GOLDEN = '#ffb878';
  const NOON = '#fff8f0';
  const MIDNIGHT = '#2a3a5c';
  const color = sunUp
    ? lerpHex(NOON, GOLDEN, goldenFrac)
    : lerpHex(GOLDEN, MIDNIGHT, nightFrac);

  // Hemisphere fill (sky/ground) + ambient strength.
  const skyColor = sunUp
    ? lerpHex('#16203a', '#bcd8f2', clamp(0.3 + 0.7 * dayFrac, 0, 1))
    : lerpHex('#16203a', '#0b1326', nightFrac);
  const groundColor = sunUp
    ? lerpHex('#2a2620', '#6b6256', dayFrac)
    : lerpHex('#15120e', '#0a0e18', nightFrac);
  const ambient = sunUp ? 0.35 + 0.45 * dayFrac : 0.16 - 0.04 * nightFrac;

  // Gradient sky background (top -> horizon).
  const skyTop = sunUp
    ? lerpHex('#5a93d4', '#4a5a86', goldenFrac)
    : lerpHex('#4a5a86', '#070b18', nightFrac);
  const skyBottom = sunUp
    ? lerpHex('#cfe3f2', '#f7a96b', goldenFrac)
    : lerpHex('#f7a96b', '#141e38', nightFrac);

  // Window glass tint: neutral daylight, warm at golden hour, blue at night.
  const glassTint = sunUp
    ? lerpHex('#cfe6ff', '#ffd2a0', goldenFrac)
    : lerpHex('#ffd2a0', '#3a4e74', nightFrac);

  return {
    position,
    color,
    intensity,
    skyColor,
    groundColor,
    ambient,
    skyTop,
    skyBottom,
    glassTint,
  };
}

/** Unit vector of parallel sun rays (position → scene), from the same angles as sampleSun. */
export function sunLightDirection(
  timeOfDay: number,
  orientationDeg: number,
): [number, number, number] {
  const h = clamp(timeOfDay, 0, 24);
  const dayPhase = (h - SUNRISE) / DAY_SPAN;
  const elevationDeg = MAX_ELEVATION * Math.sin(dayPhase * Math.PI);
  const azimuthDeg = 90 + 180 * dayPhase + orientationDeg;
  const elevRad = elevationDeg * DEG;
  const azRad = azimuthDeg * DEG;
  const horiz = Math.cos(elevRad);
  const dx = -horiz * Math.cos(azRad);
  const dy = -Math.sin(elevRad);
  const dz = -horiz * Math.sin(azRad);
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  return [dx / len, dy / len, dz / len];
}

/** Format fractional hour as HH:MM (24h). */
export function formatTimeOfDay(hours: number): string {
  const totalMin = Math.round(clamp(hours, 0, 24) * 60) % (24 * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** True when the sun is above the horizon (roughly sunrise–sunset). */
export function isDaytime(hours: number): boolean {
  const h = clamp(hours, 0, 24);
  const dayPhase = (h - SUNRISE) / DAY_SPAN;
  return MAX_ELEVATION * Math.sin(dayPhase * Math.PI) > 0;
}
