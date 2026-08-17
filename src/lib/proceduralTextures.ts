import * as THREE from 'three';
import { MATERIAL_PRESETS, type MaterialMaps, type MaterialPresetId } from './roomMaterials';

const SIZE = 512;
const cache = new Map<string, { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }>();

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Integer lattice hash that wraps so procedural maps tile seamlessly. */
function hash2Wrap(x: number, y: number, seed: number, period: number): number {
  const px = ((x % period) + period) % period;
  const py = ((y % period) + period) % period;
  return hash2(px, py, seed);
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Value noise on a toroidal period×period lattice (period must be a positive integer). */
function valueNoiseWrap(x: number, y: number, seed: number, period: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2Wrap(x0, y0, seed, period);
  const b = hash2Wrap(x0 + 1, y0, seed, period);
  const c = hash2Wrap(x0, y0 + 1, seed, period);
  const d = hash2Wrap(x0 + 1, y0 + 1, seed, period);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 19);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Seamless fbm over UV ∈ [0,1]. `basePeriod` is an integer tile period for the
 * coarsest octave; higher octaves use basePeriod·2^i so every layer wraps.
 */
function fbmSeamless(u: number, v: number, seed: number, basePeriod: number, octaves = 4): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const period = basePeriod * (1 << i);
    sum += amp * valueNoiseWrap(u * period, v * period, seed + i * 19, period);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

function paintAlbedo(
  ctx: CanvasRenderingContext2D,
  preset: MaterialMaps,
  seed: number,
  size: number,
): Uint8ClampedArray {
  const img = ctx.createImageData(size, size);
  const [br, bg, bb] = hexToRgb(preset.color);
  const varAmt = preset.variation ?? 0.04;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let n = 0.5;
      let r = br;
      let g = bg;
      let b = bb;

      switch (preset.style) {
        case 'plaster':
        case 'paint':
        case 'trim': {
          n = fbm(u * 6, v * 6, seed, 5);
          break;
        }
        case 'concrete': {
          // Soft poured concrete only — seamless fbm, no discrete chips.
          const warp = (fbmSeamless(u, v, seed + 2, 3, 3) - 0.5) * 0.05;
          const wu = u + warp;
          const wv = v + (fbmSeamless(u, v, seed + 5, 3, 3) - 0.5) * 0.05;
          const pour = fbmSeamless(wu, wv, seed, 5, 4);
          const mid = fbmSeamless(wu, wv, seed + 41, 17, 4);
          const fine = fbmSeamless(wu, wv, seed + 73, 41, 3);
          n = pour * 0.5 + mid * 0.32 + fine * 0.18;
          break;
        }
        case 'wood': {
          const angle = preset.grainAngle ?? 0;
          const gx = u * Math.cos(angle) + v * Math.sin(angle);
          const gy = -u * Math.sin(angle) + v * Math.cos(angle);
          const grain = Math.sin(gx * 80 + fbm(gx * 4, gy * 12, seed, 3) * 6);
          n = 0.45 + grain * 0.12 + fbm(u * 3, v * 14, seed + 7, 3) * 0.2;
          break;
        }
        case 'carpet': {
          n = fbm(u * 40, v * 40, seed, 2) * 0.6 + fbm(u * 8, v * 8, seed + 11, 3) * 0.4;
          break;
        }
      }

      const delta = (n - 0.5) * 2 * varAmt * 255;
      const i = (y * size + x) * 4;
      if (preset.style === 'concrete') {
        // Very slight cool/warm cast — still reads as one cement color.
        const tint = (fbmSeamless(u, v, seed + 101, 7, 3) - 0.5) * 8;
        img.data[i] = Math.max(0, Math.min(255, r + delta + tint * 0.2));
        img.data[i + 1] = Math.max(0, Math.min(255, g + delta));
        img.data[i + 2] = Math.max(0, Math.min(255, b + delta - tint * 0.25));
      } else {
        img.data[i] = Math.max(0, Math.min(255, r + delta));
        img.data[i + 1] = Math.max(0, Math.min(255, g + delta));
        img.data[i + 2] = Math.max(0, Math.min(255, b + delta));
      }
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return img.data;
}

function paintNormalRoughness(
  albedo: Uint8ClampedArray,
  preset: MaterialMaps,
  size: number,
): { normal: ImageData; roughness: ImageData } {
  const normal = new ImageData(size, size);
  const roughness = new ImageData(size, size);
  const baseR = Math.round(preset.roughness * 255);
  const strength =
    preset.style === 'concrete' ? 1.15 : preset.style === 'wood' ? 1.35 : preset.style === 'carpet' ? 3 : 1.1;

  const lum = (x: number, y: number) => {
    const xx = ((x % size) + size) % size;
    const yy = ((y % size) + size) % size;
    const i = (yy * size + xx) * 4;
    return (albedo[i]! + albedo[i + 1]! + albedo[i + 2]!) / (3 * 255);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
      const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * size + x) * 4;
      normal.data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      normal.data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      normal.data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      normal.data[i + 3] = 255;

      const micro = Math.abs(dx) + Math.abs(dy);
      const microBoost = preset.style === 'wood' ? 22 : preset.style === 'concrete' ? 24 : 40;
      const rough = Math.max(0, Math.min(255, baseR + micro * microBoost));
      roughness.data[i] = rough;
      roughness.data[i + 1] = rough;
      roughness.data[i + 2] = rough;
      roughness.data[i + 3] = 255;
    }
  }
  return { normal, roughness };
}

function canvasToTexture(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function imageDataToTexture(data: ImageData, srgb: boolean, size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  return canvasToTexture(canvas, srgb);
}

export interface LoadedMaterialMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  color: string;
  roughness: number;
  metalness: number;
  repeatInches: number;
}

function mapsFromPreset(id: string, preset: MaterialMaps): LoadedMaterialMaps {
  const cached = cache.get(id);
  if (cached) {
    return {
      ...cached,
      color: preset.color,
      roughness: preset.roughness,
      metalness: preset.metalness ?? 0,
      repeatInches: preset.repeatInches,
    };
  }

  const size = SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const seed = Array.from(id).reduce((a, c) => a + c.charCodeAt(0), 0);
  const albedo = paintAlbedo(ctx, preset, seed, size);
  const map = canvasToTexture(canvas, true);
  const { normal, roughness } = paintNormalRoughness(albedo, preset, size);
  const normalMap = imageDataToTexture(normal, false, size);
  const roughnessMap = imageDataToTexture(roughness, false, size);

  const entry = { map, normalMap, roughnessMap };
  cache.set(id, entry);
  return {
    ...entry,
    color: preset.color,
    roughness: preset.roughness,
    metalness: preset.metalness ?? 0,
    repeatInches: preset.repeatInches,
  };
}

/** Generate (and cache) procedural PBR maps for a preset. */
export function getProceduralMaterialMaps(id: MaterialPresetId): LoadedMaterialMaps {
  // Bump concrete cache when generator changes.
  const cacheKey = id === 'concrete' ? 'concrete:smooth-v4' : id;
  return mapsFromPreset(cacheKey, MATERIAL_PRESETS[id]);
}

/**
 * Neutral plaster maps tinted via material.color — one texture for any wall paint.
 * Albedo is near-white so the chosen wallColor multiplies cleanly.
 */
export function getTintableWallMaps(): LoadedMaterialMaps {
  return mapsFromPreset('__wallTintBase', {
    color: '#ffffff',
    roughness: 0.88,
    repeatInches: 48,
    style: 'plaster',
    variation: 0.045,
    attribution: 'Procedural plaster (original, CC0)',
  });
}

/** Configure UV repeat so one tile ≈ `repeatInches` in world units (inches). */
export function applyWorldRepeat(
  textures: { map?: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture },
  repeatInches: number,
  worldWidth: number,
  worldHeight: number,
): void {
  const rx = Math.max(0.01, worldWidth / repeatInches);
  const ry = Math.max(0.01, worldHeight / repeatInches);
  for (const t of [textures.map, textures.normalMap, textures.roughnessMap]) {
    if (!t) continue;
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
  }
}
