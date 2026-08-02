export type Weather = 'clear' | 'partlyCloudy' | 'overcast' | 'foggy' | 'rain' | 'snow';

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

export interface WeatherModulation {
  skyTop: string;
  skyBottom: string;
  sunMul: number;
  ambientMul: number;
  fog: { color: string; near: number; far: number } | null;
  cloudCover: number;
  precip: 'rain' | 'snow' | null;
  stars: boolean;
}

export interface ProceduralSkyParams {
  sunPosition: [number, number, number];
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
}

export interface ColorGradingParams {
  bloomIntensity: number;
  bloomThreshold: number;
  saturation: number;
  brightness: number;
  contrast: number;
  hue: number;
  vignetteDarkness: number;
  toneExposure: number;
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

const WEATHER_SKY_GREY = '#8a9098';
const WEATHER_SKY_COOL = '#b8c4d0';
const WEATHER_FOG = '#c8ccd2';

/**
 * Modulates sun/sky for a chosen weather preset. Composes with time-of-day so
 * golden-hour rain or starry clear nights stay coherent.
 */
export function applyWeather(
  sun: SunSample,
  weather: Weather,
  roomSize?: { width: number; depth: number },
): WeatherModulation {
  const rw = roomSize?.width ?? 101;
  const rd = roomSize?.depth ?? 180;
  const span = Math.max(rw, rd);
  const fogNear = span * 1.4 + 120;
  const fogFar = span * 3.2 + 280;

  const base: WeatherModulation = {
    skyTop: sun.skyTop,
    skyBottom: sun.skyBottom,
    sunMul: 1,
    ambientMul: 1,
    fog: null,
    cloudCover: 0,
    precip: null,
    stars: false,
  };

  switch (weather) {
    case 'clear':
      return {
        ...base,
        cloudCover: 0.08,
        stars: !isDaytimeFromSun(sun),
      };
    case 'partlyCloudy':
      return {
        ...base,
        skyTop: lerpHex(sun.skyTop, WEATHER_SKY_GREY, 0.22),
        skyBottom: lerpHex(sun.skyBottom, '#a8b0b8', 0.18),
        sunMul: 0.88,
        ambientMul: 1.06,
        cloudCover: 0.42,
        stars: !isDaytimeFromSun(sun),
      };
    case 'overcast':
      return {
        ...base,
        skyTop: lerpHex(sun.skyTop, WEATHER_SKY_GREY, 0.72),
        skyBottom: lerpHex(sun.skyBottom, '#9aa0a8', 0.65),
        sunMul: 0.42,
        ambientMul: 1.22,
        cloudCover: 0.88,
      };
    case 'foggy':
      return {
        ...base,
        skyTop: lerpHex(sun.skyTop, WEATHER_FOG, 0.55),
        skyBottom: lerpHex(sun.skyBottom, WEATHER_FOG, 0.7),
        sunMul: 0.35,
        ambientMul: 1.18,
        fog: { color: WEATHER_FOG, near: fogNear, far: fogFar },
        cloudCover: 0.55,
      };
    case 'rain':
      return {
        ...base,
        skyTop: lerpHex(sun.skyTop, '#6a7480', 0.78),
        skyBottom: lerpHex(sun.skyBottom, '#7a8490', 0.72),
        sunMul: 0.28,
        ambientMul: 1.28,
        fog: { color: '#8a929c', near: fogNear * 0.95, far: fogFar * 0.9 },
        cloudCover: 0.95,
        precip: 'rain',
      };
    case 'snow':
      return {
        ...base,
        skyTop: lerpHex(sun.skyTop, WEATHER_SKY_COOL, 0.45),
        skyBottom: lerpHex(sun.skyBottom, '#d8e2ea', 0.55),
        sunMul: 0.52,
        ambientMul: 1.35,
        fog: { color: '#dce4ec', near: fogNear, far: fogFar * 1.05 },
        cloudCover: 0.75,
        precip: 'snow',
      };
    default:
      return base;
  }
}

/** Infer daytime from sun intensity (avoids threading timeOfDay into applyWeather). */
function isDaytimeFromSun(sun: SunSample): boolean {
  return sun.intensity > 0.1;
}

/** Sun elevation/azimuth in degrees — shared by lighting and procedural sky. */
export function sunAngles(timeOfDay: number, orientationDeg: number) {
  const h = clamp(timeOfDay, 0, 24);
  const dayPhase = (h - SUNRISE) / DAY_SPAN;
  const elevationDeg = MAX_ELEVATION * Math.sin(dayPhase * Math.PI);
  const azimuthDeg = 90 + 180 * dayPhase + orientationDeg;
  return { elevationDeg, azimuthDeg, dayPhase };
}

/** 0 when sun is high, →1 near/below horizon — drives haze, bloom, and exposure guards. */
export function horizonFactor(timeOfDay: number, orientationDeg: number): number {
  const { elevationDeg } = sunAngles(timeOfDay, orientationDeg);
  if (elevationDeg <= 0) return 0;
  return clamp(1 - elevationDeg / 24, 0, 1);
}

/** Coarse keys so light-shaft geometry is not rebuilt every slider tick. */
export const BEAM_TIME_QUANTUM = 0.25;
export const BEAM_ORIENT_QUANTUM = 15;

export function beamGeometryKey(timeOfDay: number, orientationDeg: number) {
  return {
    time: Math.round(timeOfDay / BEAM_TIME_QUANTUM) * BEAM_TIME_QUANTUM,
    orient: Math.round(orientationDeg / BEAM_ORIENT_QUANTUM) * BEAM_ORIENT_QUANTUM,
  };
}

function sunDirectionForSky(
  sun: SunSample,
  centroid: [number, number],
): [number, number, number] {
  const dx = sun.position[0] - centroid[0];
  const dy = sun.position[1];
  const dz = sun.position[2] - centroid[1];
  const len = Math.hypot(dx, dy, dz) || 1;
  return [dx / len, dy / len, dz / len];
}

/**
 * Preetham-sky inputs for drei Sky, derived from time/weather. sunPosition is a
 * unit direction toward the sun from the room centroid.
 */
export function proceduralSkyParams(
  timeOfDay: number,
  orientationDeg: number,
  weather: Weather,
  roomSize?: { width: number; depth: number; minX?: number; minZ?: number },
): ProceduralSkyParams {
  const sun = sampleSun(timeOfDay, orientationDeg, roomSize);
  const cx = (roomSize?.minX ?? 0) + (roomSize?.width ?? 101) / 2;
  const cz = (roomSize?.minZ ?? 0) + (roomSize?.depth ?? 180) / 2;
  const sunPosition = sunDirectionForSky(sun, [cx, cz]);

  let turbidity = 2;
  let rayleigh = 1.8;
  switch (weather) {
    case 'clear':
      turbidity = 2;
      rayleigh = 2.2;
      break;
    case 'partlyCloudy':
      turbidity = 5.5;
      rayleigh = 1.4;
      break;
    case 'overcast':
      turbidity = 14;
      rayleigh = 0.45;
      break;
    case 'foggy':
      turbidity = 18;
      rayleigh = 0.28;
      break;
    case 'rain':
      turbidity = 20;
      rayleigh = 0.22;
      break;
    case 'snow':
      turbidity = 11;
      rayleigh = 0.75;
      break;
  }

  if (!isDaytime(timeOfDay)) {
    turbidity = Math.min(turbidity, 1.2);
    rayleigh = 0.12;
  } else {
    const horizon = horizonFactor(timeOfDay, orientationDeg);
    turbidity += horizon * 12;
    rayleigh *= 1 - horizon * 0.5;
  }

  const horizon = isDaytime(timeOfDay) ? horizonFactor(timeOfDay, orientationDeg) : 0;

  return {
    sunPosition,
    turbidity,
    rayleigh,
    mieCoefficient: (weather === 'snow' ? 0.003 : 0.005) + horizon * 0.006,
    mieDirectionalG: 0.82,
  };
}

/** Bloom + color-grade strengths from sun, weather, and exposure. */
export function colorGradingParams(
  timeOfDay: number,
  orientationDeg: number,
  weather: Weather,
  exposure: number,
  roomSize?: { width: number; depth: number },
): ColorGradingParams {
  const sun = sampleSun(timeOfDay, orientationDeg, roomSize);
  const mod = applyWeather(sun, weather, roomSize);
  const { elevationDeg } = sunAngles(timeOfDay, orientationDeg);
  const day = isDaytime(timeOfDay);
  const horizon = day ? horizonFactor(timeOfDay, orientationDeg) : 0;
  // Warm band slightly above the horizon — not at the horizon itself (avoids blowout).
  const goldenBand = day ? clamp(1 - Math.abs(elevationDeg - 14) / 22, 0, 1) : 0;

  const bloomIntensity =
    (day ? 0.09 + goldenBand * 0.16 : 0.05) *
    exposure *
    (0.68 + mod.sunMul * 0.38) *
    (1 - horizon * 0.72);
  const bloomThreshold = day ? 0.86 + horizon * 0.1 : 0.93;

  let saturation = day ? 0.05 + goldenBand * 0.1 : -0.04;
  if (weather === 'rain' || weather === 'overcast') saturation -= 0.14;
  if (weather === 'foggy') saturation -= 0.08;
  if (weather === 'snow') saturation -= 0.04;

  const hue = day ? goldenBand * 0.035 - (weather === 'snow' ? 0.015 : 0) : 0.008;
  const brightness =
    (exposure - 1) * 0.07 + (mod.ambientMul - 1) * 0.04 - horizon * 0.16;
  const contrast = day ? 0.04 + mod.sunMul * 0.06 + horizon * 0.04 : 0.02;
  const vignetteDarkness = 0.28 + (day ? 0.05 + horizon * 0.06 : 0.14);
  const toneExposure = exposure * (1 - horizon * 0.38);

  return {
    bloomIntensity: clamp(bloomIntensity, 0.03, 0.45),
    bloomThreshold: clamp(bloomThreshold, 0.78, 0.98),
    saturation: clamp(saturation, -0.22, 0.22),
    brightness: clamp(brightness, -0.22, 0.12),
    contrast: clamp(contrast, -0.02, 0.22),
    hue: clamp(hue, -0.03, 0.05),
    vignetteDarkness: clamp(vignetteDarkness, 0.24, 0.58),
    toneExposure: clamp(toneExposure, 0.55, 1.35),
  };
}

/** 0 = no shafts, 1 = full shafts — driven by weather preset. */
export function weatherGodRayStrength(weather: Weather): number {
  switch (weather) {
    case 'clear':
      return 1;
    case 'partlyCloudy':
      return 0.4;
    case 'overcast':
      return 0;
    case 'foggy':
    case 'rain':
      return 0;
    case 'snow':
      return 0.08;
    default:
      return 0;
  }
}

export interface InteriorHazeParams {
  color: string;
  scatterDensity: number;
  sunDir: [number, number, number];
}

/** Interior air scatter when light shafts are enabled. */
export function interiorHazeParams(
  timeOfDay: number,
  orientationDeg: number,
  weather: Weather,
  exposure: number,
  roomSize?: { width: number; depth: number },
): InteriorHazeParams | null {
  const sun = sampleSun(timeOfDay, orientationDeg, roomSize);
  if (sun.intensity < 0.12) return null;

  const mod = applyWeather(sun, weather, roomSize);
  const horizon = horizonFactor(timeOfDay, orientationDeg);
  const weatherMul = weatherGodRayStrength(weather);
  if (weatherMul < 0.02) return null;
  const strength = sun.intensity * exposure * mod.sunMul * (1 - horizon * 0.55) * weatherMul;
  if (strength < 0.04) return null;

  const warm = lerpHex(sun.color, '#eef3fa', 0.45);
  return {
    color: warm,
    scatterDensity: 0.065 * strength,
    sunDir: sunLightDirection(timeOfDay, orientationDeg),
  };
}

export const WEATHER_OPTIONS: { id: Weather; label: string; glyph: string }[] = [
  { id: 'clear', label: 'Clear', glyph: '☀' },
  { id: 'partlyCloudy', label: 'Partly cloudy', glyph: '⛅' },
  { id: 'overcast', label: 'Overcast', glyph: '☁' },
  { id: 'foggy', label: 'Foggy', glyph: '🌫' },
  { id: 'rain', label: 'Rain', glyph: '🌧' },
  { id: 'snow', label: 'Snow', glyph: '❄' },
];
