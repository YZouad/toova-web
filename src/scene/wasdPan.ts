import {
  pointInPolygon,
  vertexById,
  type FloorPlan,
  type FloorPlanBounds,
} from '../lib/floorPlanGeometry';

export interface WasdKeys {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Slowest slide, about a walking pace (inches per second). */
const MIN_SPEED = 48;
/** Fastest slide when the camera is pulled back over a large plan. */
const MAX_SPEED = 220;
const SPEED_FROM_DISTANCE = 0.55;
/** Ignore a hitch longer than this so a stalled frame can't fling the camera. */
const MAX_DT = 0.05;

export function emptyWasdKeys(): WasdKeys {
  return { w: false, a: false, s: false, d: false };
}

export function wasdKeyFromCode(code: string): keyof WasdKeys | null {
  switch (code) {
    case 'KeyW':
      return 'w';
    case 'KeyA':
      return 'a';
    case 'KeyS':
      return 's';
    case 'KeyD':
      return 'd';
    default:
      return null;
  }
}

export function wasdSpeed(orbitDistance: number): number {
  if (!Number.isFinite(orbitDistance) || orbitDistance <= 0) return MIN_SPEED;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, orbitDistance * SPEED_FROM_DISTANCE));
}

/**
 * Horizontal slide for one frame, in inches.
 * W/S follow the camera's look direction flattened onto the floor.
 * A/D strafe. Looking straight down uses the top of the screen as forward.
 */
export function wasdTranslation(
  look: Vec3,
  screenUp: Vec3,
  keys: WasdKeys,
  orbitDistance: number,
  dt: number,
): Vec3 | null {
  const inputX = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  const inputZ = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
  if (inputX === 0 && inputZ === 0) return null;
  if (!(dt > 0)) return null;

  let fx = look.x;
  let fz = look.z;
  let fl = Math.hypot(fx, fz);
  if (fl < 1e-4) {
    fx = screenUp.x;
    fz = screenUp.z;
    fl = Math.hypot(fx, fz);
  }
  if (fl < 1e-4) return null;
  fx /= fl;
  fz /= fl;

  // right = look × world-up, kept on the floor.
  const rx = -fz;
  const rz = fx;

  let mx = fx * inputZ + rx * inputX;
  let mz = fz * inputZ + rz * inputX;
  const ml = Math.hypot(mx, mz);
  if (ml < 1e-8) return null;

  const step = wasdSpeed(orbitDistance) * Math.min(dt, MAX_DT);
  return { x: (mx / ml) * step, y: 0, z: (mz / ml) * step };
}

/** Inches kept between a walking camera and a solid wall. */
export const WALK_CLEARANCE = 10;
/** Cameras at or below this height use walk collision. Dollhouse views sit above it. */
export const EYE_LEVEL_MAX = 78;

export function constrainCameraSlide(
  x: number,
  z: number,
  dx: number,
  dz: number,
  allowed: (x: number, z: number) => boolean,
): { dx: number; dz: number } {
  if (dx === 0 && dz === 0) return { dx: 0, dz: 0 };
  if (allowed(x + dx, z + dz)) return { dx, dz };
  const xOk = dx !== 0 && allowed(x + dx, z);
  const zOk = dz !== 0 && allowed(x, z + dz);
  return { dx: xOk ? dx : 0, dz: zOk ? dz : 0 };
}

/** Distance to the nearest solid wall. Door spans are openings, not walls. */
export function solidClearance(x: number, z: number, plan: FloorPlan): number {
  let min = Infinity;
  for (const wall of plan.walls) {
    const a = vertexById(plan, wall.startId);
    const b = vertexById(plan, wall.endId);
    if (!a || !b) continue;
    const wx = b.x - a.x;
    const wz = b.z - a.z;
    const len2 = wx * wx + wz * wz;
    if (len2 < 1e-6) continue;
    const len = Math.sqrt(len2);
    const t = Math.min(1, Math.max(0, ((x - a.x) * wx + (z - a.z) * wz) / len2));
    const along = t * len;
    if (doorCovers(plan, wall.id, along)) continue;
    const px = a.x + t * wx;
    const pz = a.z + t * wz;
    min = Math.min(min, Math.hypot(x - px, z - pz));
  }
  return min;
}

function doorCovers(plan: FloorPlan, wallId: string, along: number): boolean {
  const pad = 2;
  for (const opening of plan.openings) {
    if (opening.wallId !== wallId || opening.kind !== 'door') continue;
    if (along >= opening.offset - pad && along <= opening.offset + opening.width + pad) return true;
  }
  return false;
}

/**
 * Eye-level slide. Stay on the floor, don't enter a wall, and allow a step
 * that moves you off a wall you are already touching.
 */
export function slideKeepsFooting(
  x: number,
  z: number,
  dx: number,
  dz: number,
  plan: FloorPlan,
): { dx: number; dz: number } {
  const here = solidClearance(x, z, plan);
  return constrainCameraSlide(x, z, dx, dz, (nx, nz) => {
    if (!pointInPolygon(nx, nz, plan, 0)) return false;
    const next = solidClearance(nx, nz, plan);
    if (next >= WALK_CLEARANCE) return true;
    return next + 0.25 >= here;
  });
}

/** Keep the orbit target over the plan, with room to frame the outside walls. */
export function clampTargetXZ(
  x: number,
  z: number,
  bounds: FloorPlanBounds,
): { x: number; z: number } {
  const span = Math.max(bounds.width, bounds.depth, 1);
  const margin = span * 0.65 + 120;
  return {
    x: Math.min(bounds.maxX + margin, Math.max(bounds.minX - margin, x)),
    z: Math.min(bounds.maxZ + margin, Math.max(bounds.minZ - margin, z)),
  };
}
