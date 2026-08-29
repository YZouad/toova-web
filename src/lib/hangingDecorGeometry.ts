/**
 * Geometry helpers for hanging decorations (leaf garlands + LED strings).
 * World units are inches. Paths are deterministic given a config + seed.
 */

import type { FloorPlan, WallSegment } from './floorPlanGeometry';
import { getWallSegment, wallById } from './floorPlanGeometry';
import { ROOM } from '../units';

export const HANGING_CONFIG_VERSION = 1 as const;

export type HangingDecorKind = 'leaves' | 'lights';

export interface WallAnchor {
  surface: 'wall';
  wallId: string;
  /** Distance along wall from start vertex (inches). */
  offset: number;
  /** Height from floor (inches). */
  height: number;
}

export interface FurnitureAnchor {
  surface: 'furniture';
  /** Stable per-item key (survives row id regeneration on save). */
  attachmentKey: string;
  /** Normalized local coords in item space: x/z in [-0.5, 0.5], y in [0, 1]. */
  local: [number, number, number];
}

export type HangingAnchor = WallAnchor | FurnitureAnchor;

export interface HangingDecorationConfig {
  version: typeof HANGING_CONFIG_VERSION;
  kind: HangingDecorKind;
  anchors: HangingAnchor[];
  /** Sag depth as fraction of span length (0..0.5). Default ~0.18. */
  sag: number;
  /** Leaves: fullness 0.3..2. LEDs: spacing inches between bulbs. */
  density: number;
  /** Deterministic variation seed. */
  seed: number;
  /** LED palette (hex). Empty/ignored for leaves. */
  palette: string[];
  /** LED point-light intensity multiplier. */
  lightIntensity: number;
  /** LED point-light range (inches). */
  lightRange: number;
}

export const DEFAULT_LEAF_CONFIG: Omit<HangingDecorationConfig, 'anchors' | 'seed'> = {
  version: HANGING_CONFIG_VERSION,
  kind: 'leaves',
  sag: 0.18,
  density: 1,
  palette: [],
  lightIntensity: 1,
  lightRange: 48,
};

export const DEFAULT_LIGHT_CONFIG: Omit<HangingDecorationConfig, 'anchors' | 'seed'> = {
  version: HANGING_CONFIG_VERSION,
  kind: 'lights',
  sag: 0.14,
  density: 6, // inches between bulbs
  palette: ['#fff4e0'],
  lightIntensity: 1.2,
  lightRange: 72,
};

export const LED_PALETTE_PRESETS: { label: string; colors: string[] }[] = [
  { label: 'Warm white', colors: ['#fff4e0'] },
  { label: 'Cool white', colors: ['#e8f0ff'] },
  { label: 'Fairy multi', colors: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6bcb'] },
  { label: 'Sunset', colors: ['#ff8c42', '#ff6b6b', '#c44dff'] },
  { label: 'Ocean', colors: ['#4ecdc4', '#45b7d1', '#96ceb4'] },
];

export type Vec3 = [number, number, number];

export interface ResolvedAnchor {
  position: Vec3;
  normal: Vec3;
  source: HangingAnchor;
}

export interface FurniturePose {
  attachmentKey: string;
  position: Vec3;
  rotationY: number;
  size: Vec3;
}

/** Mulberry32 PRNG — deterministic from seed. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(parts: Array<string | number>): number {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

/** Evenly spaced indices in `[0, count)`, always including the ends when count > 1. */
export function evenlySpacedIndices(count: number, cap: number): number[] {
  if (count <= 0 || cap <= 0) return [];
  const n = Math.min(cap, count);
  if (n === 1) return [0];
  const idxs: number[] = [];
  for (let i = 0; i < n; i++) {
    idxs.push(Math.round((i * (count - 1)) / (n - 1)));
  }
  return idxs;
}

export interface ClusterLightAnchor {
  position: Vec3;
  /** Palette index of the cluster's middle bulb. */
  colorIndex: number;
}

/**
 * Collapse a dense LED run into a few real lights at group centroids.
 * Keeps illumination along the whole string without one PointLight per bulb.
 */
export function clusterLightAnchors(
  positions: Vec3[],
  cap: number,
): ClusterLightAnchor[] {
  const count = positions.length;
  if (count === 0 || cap <= 0) return [];
  const n = Math.min(cap, count);
  const out: ClusterLightAnchor[] = [];
  for (let i = 0; i < n; i++) {
    const start = Math.round((i * count) / n);
    const end = Math.max(start + 1, Math.round(((i + 1) * count) / n));
    let x = 0;
    let y = 0;
    let z = 0;
    const span = end - start;
    for (let j = start; j < end; j++) {
      const p = positions[j]!;
      x += p[0];
      y += p[1];
      z += p[2];
    }
    out.push({
      position: [x / span, y / span, z / span],
      colorIndex: start + Math.floor((span - 1) / 2),
    });
  }
  return out;
}

export function createHangingSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

export function isWallAnchor(a: HangingAnchor): a is WallAnchor {
  return a.surface === 'wall';
}

export function isFurnitureAnchor(a: HangingAnchor): a is FurnitureAnchor {
  return a.surface === 'furniture';
}

export function resolveWallAnchorWorld(
  plan: FloorPlan,
  anchor: WallAnchor,
): ResolvedAnchor | null {
  const wall = wallById(plan, anchor.wallId);
  if (!wall) return null;
  const seg = getWallSegment(plan, wall);
  if (!seg) return null;
  return wallAnchorFromSegment(seg, anchor);
}

export function wallAnchorFromSegment(
  seg: WallSegment,
  anchor: WallAnchor,
): ResolvedAnchor {
  const offset = Math.max(0, Math.min(seg.length, anchor.offset));
  const height = Math.max(0, Math.min(999, anchor.height));
  const [tx, tz] = seg.tangent;
  const [ox, oz] = seg.outward;
  const interior: [number, number] = [-ox, -oz];
  const inset = ROOM.wallThickness / 2;
  const x = seg.start.x + tx * offset + interior[0] * inset;
  const z = seg.start.z + tz * offset + interior[1] * inset;
  return {
    position: [x, height, z],
    normal: [interior[0], 0, interior[1]],
    source: { ...anchor, offset, height },
  };
}

/** Convert a world hit on a wall into a WallAnchor. */
export function wallAnchorFromWorldHit(
  seg: WallSegment,
  world: Vec3,
): WallAnchor {
  const [tx, tz] = seg.tangent;
  const dx = world[0] - seg.start.x;
  const dz = world[2] - seg.start.z;
  const offset = Math.max(0, Math.min(seg.length, dx * tx + dz * tz));
  return {
    surface: 'wall',
    wallId: seg.wall.id,
    offset,
    height: Math.max(0, world[1]),
  };
}

/** Local coords: x/z in [-0.5,0.5] of footprint, y in [0,1] of height. */
export function furnitureLocalFromWorld(
  pose: FurniturePose,
  world: Vec3,
): [number, number, number] {
  const [px, py, pz] = pose.position;
  const [w, h, d] = pose.size;
  const cos = Math.cos(-pose.rotationY);
  const sin = Math.sin(-pose.rotationY);
  const dx = world[0] - px;
  const dz = world[2] - pz;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const ly = world[1] - py;
  return [
    clamp(lx / Math.max(1e-3, w), -0.5, 0.5),
    clamp(ly / Math.max(1e-3, h), 0, 1),
    clamp(lz / Math.max(1e-3, d), -0.5, 0.5),
  ];
}

export function resolveFurnitureAnchorWorld(
  pose: FurniturePose,
  anchor: FurnitureAnchor,
): ResolvedAnchor {
  const [nx, ny, nz] = anchor.local;
  const [w, h, d] = pose.size;
  const lx = nx * w;
  const ly = ny * h;
  const lz = nz * d;
  const cos = Math.cos(pose.rotationY);
  const sin = Math.sin(pose.rotationY);
  const wx = pose.position[0] + lx * cos + lz * sin;
  const wz = pose.position[2] - lx * sin + lz * cos;
  const wy = pose.position[1] + ly;

  // Approximate outward normal from local face closest to hit.
  const absX = Math.abs(nx);
  const absY = Math.abs(ny - 0.5);
  const absZ = Math.abs(nz);
  let localN: Vec3 = [0, 1, 0];
  if (absX >= absZ && absX >= absY) {
    localN = [Math.sign(nx) || 1, 0, 0];
  } else if (absZ >= absX && absZ >= absY) {
    localN = [0, 0, Math.sign(nz) || 1];
  } else if (ny > 0.85) {
    localN = [0, 1, 0];
  } else if (ny < 0.15) {
    localN = [0, -1, 0];
  }

  const nwx = localN[0] * cos + localN[2] * sin;
  const nwz = -localN[0] * sin + localN[2] * cos;
  return {
    position: [wx, wy, wz],
    normal: [nwx, localN[1], nwz],
    source: anchor,
  };
}

export function resolveAnchors(
  plan: FloorPlan,
  furniture: Map<string, FurniturePose>,
  anchors: HangingAnchor[],
): { resolved: ResolvedAnchor[]; missing: HangingAnchor[] } {
  const resolved: ResolvedAnchor[] = [];
  const missing: HangingAnchor[] = [];
  for (const a of anchors) {
    if (isWallAnchor(a)) {
      const r = resolveWallAnchorWorld(plan, a);
      if (r) resolved.push(r);
      else missing.push(a);
    } else {
      const pose = furniture.get(a.attachmentKey);
      if (!pose) {
        missing.push(a);
        continue;
      }
      resolved.push(resolveFurnitureAnchorWorld(pose, a));
    }
  }
  return { resolved, missing };
}

/**
 * Catenary-ish sag between two points. Midpoint drops by sag * spanLength.
 * Returns evenly spaced samples including endpoints.
 */
export function saggedSpan(
  a: Vec3,
  b: Vec3,
  sag: number,
  samples = 16,
): Vec3[] {
  const n = Math.max(2, Math.floor(samples));
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const drop = Math.max(0, Math.min(0.5, sag)) * Math.max(len, 1);
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Parabolic sag: max at t=0.5
    const s = 4 * t * (1 - t);
    out.push([
      a[0] + dx * t,
      a[1] + dy * t - drop * s,
      a[2] + dz * t,
    ]);
  }
  return out;
}

/** Build a multi-span path through resolved anchors. */
export function buildHangingPath(
  points: Vec3[],
  sag: number,
  samplesPerSpan = 16,
): Vec3[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]!];
  const path: Vec3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const span = saggedSpan(points[i]!, points[i + 1]!, sag, samplesPerSpan);
    if (i > 0) span.shift(); // avoid duplicate joint
    path.push(...span);
  }
  return path;
}

export function pathLength(path: Vec3[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return len;
}

export function sampleAlongPath(
  path: Vec3[],
  spacing: number,
): Array<{ position: Vec3; tangent: Vec3; t: number }> {
  if (path.length < 2) return [];
  const spacingClamped = Math.max(0.5, spacing);
  const total = pathLength(path);
  if (total < 1e-3) return [];

  // Precompute cumulative lengths
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    cum.push(cum[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }

  const samples: Array<{ position: Vec3; tangent: Vec3; t: number }> = [];
  const count = Math.max(1, Math.floor(total / spacingClamped) + 1);
  for (let i = 0; i < count; i++) {
    const dist = Math.min(total, (i / Math.max(1, count - 1)) * total);
    const { position, tangent } = interpolateAtDistance(path, cum, dist);
    samples.push({ position, tangent, t: dist / total });
  }
  return samples;
}

function interpolateAtDistance(
  path: Vec3[],
  cum: number[],
  dist: number,
): { position: Vec3; tangent: Vec3 } {
  let i = 0;
  while (i < cum.length - 1 && cum[i + 1]! < dist) i++;
  const a = path[i]!;
  const b = path[Math.min(i + 1, path.length - 1)]!;
  const segLen = Math.max(1e-6, cum[Math.min(i + 1, cum.length - 1)]! - cum[i]!);
  const u = clamp((dist - cum[i]!) / segLen, 0, 1);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  return {
    position: [a[0] + dx * u, a[1] + dy * u, a[2] + dz * u],
    tangent: [dx / len, dy / len, dz / len],
  };
}

export function pathBounds(path: Vec3[]): {
  min: Vec3;
  max: Vec3;
  size: Vec3;
  center: Vec3;
} {
  if (path.length === 0) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      size: [1, 1, 1],
      center: [0, 0, 0],
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const p of path) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    minZ = Math.min(minZ, p[2]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
    maxZ = Math.max(maxZ, p[2]);
  }
  // Pad so selection / collision have volume
  const pad = 4;
  minX -= pad;
  minY -= pad;
  minZ -= pad;
  maxX += pad;
  maxY += pad;
  maxZ += pad;
  const size: Vec3 = [maxX - minX, maxY - minY, maxZ - minZ];
  const center: Vec3 = [(minX + maxX) / 2, minY, (minZ + maxZ) / 2]; // y = bottom
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ], size, center };
}

/** Leaf instance count from path length and density. */
export function leafCountForPath(len: number, density: number, qualityMul = 1): number {
  const base = (len / 4) * clamp(density, 0.3, 2) * qualityMul;
  return Math.max(4, Math.min(200, Math.round(base)));
}

/** LED spacing (inches) from density field. */
export function ledSpacingInches(density: number): number {
  return clamp(density, 2, 24);
}

export function paletteColorAt(palette: string[], index: number): string {
  if (!palette.length) return '#fff4e0';
  return palette[index % palette.length]!;
}

export function parseHangingConfig(raw: unknown): HangingDecorationConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== HANGING_CONFIG_VERSION) return null;
  if (o.kind !== 'leaves' && o.kind !== 'lights') return null;
  if (!Array.isArray(o.anchors) || o.anchors.length < 2) return null;

  const anchors: HangingAnchor[] = [];
  for (const a of o.anchors) {
    if (!a || typeof a !== 'object') return null;
    const an = a as Record<string, unknown>;
    if (an.surface === 'wall') {
      if (typeof an.wallId !== 'string' || typeof an.offset !== 'number' || typeof an.height !== 'number') {
        return null;
      }
      anchors.push({
        surface: 'wall',
        wallId: an.wallId,
        offset: an.offset,
        height: an.height,
      });
    } else if (an.surface === 'furniture') {
      if (typeof an.attachmentKey !== 'string' || !Array.isArray(an.local) || an.local.length !== 3) {
        return null;
      }
      const lx = Number(an.local[0]);
      const ly = Number(an.local[1]);
      const lz = Number(an.local[2]);
      if (![lx, ly, lz].every(Number.isFinite)) return null;
      anchors.push({
        surface: 'furniture',
        attachmentKey: an.attachmentKey,
        local: [lx, ly, lz],
      });
    } else {
      return null;
    }
  }

  const sag = typeof o.sag === 'number' && Number.isFinite(o.sag) ? clamp(o.sag, 0, 0.5) : 0.18;
  const density =
    typeof o.density === 'number' && Number.isFinite(o.density)
      ? o.density
      : o.kind === 'lights'
        ? 6
        : 1;
  const seed =
    typeof o.seed === 'number' && Number.isFinite(o.seed) ? (o.seed >>> 0) : createHangingSeed();
  const palette = Array.isArray(o.palette)
    ? o.palette.filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
    : o.kind === 'lights'
      ? ['#fff4e0']
      : [];
  const lightIntensity =
    typeof o.lightIntensity === 'number' && Number.isFinite(o.lightIntensity)
      ? clamp(o.lightIntensity, 0.1, 5)
      : 1.2;
  const lightRange =
    typeof o.lightRange === 'number' && Number.isFinite(o.lightRange)
      ? clamp(o.lightRange, 8, 200)
      : 72;

  return {
    version: HANGING_CONFIG_VERSION,
    kind: o.kind,
    anchors,
    sag,
    density,
    seed,
    palette,
    lightIntensity,
    lightRange,
  };
}

export function hangingReferencesAttachmentKey(
  config: HangingDecorationConfig,
  attachmentKey: string,
): boolean {
  return config.anchors.some(
    (a) => isFurnitureAnchor(a) && a.attachmentKey === attachmentKey,
  );
}

export function hangingHasMissingTargets(
  config: HangingDecorationConfig,
  plan: FloorPlan,
  furnitureKeys: Set<string>,
): boolean {
  for (const a of config.anchors) {
    if (isWallAnchor(a)) {
      if (!wallById(plan, a.wallId)) return true;
    } else if (!furnitureKeys.has(a.attachmentKey)) {
      return true;
    }
  }
  return false;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
