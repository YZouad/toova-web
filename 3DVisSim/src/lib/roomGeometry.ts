import { ROOM, WINDOW } from '../units';

export type WallId = 'north' | 'south' | 'east' | 'west';

export interface RoomWindow {
  wall: WallId;
  /** Offset from wall center along the wall's horizontal axis (inches). */
  x: number;
  /** Sill height from floor (inches). */
  y: number;
  w: number;
  h: number;
}

export interface RoomGeometry {
  width: number;
  depth: number;
  height: number;
  windows: RoomWindow[];
}

export const DEFAULT_ROOM_GEOMETRY: RoomGeometry = {
  width: ROOM.width,
  depth: ROOM.depth,
  height: ROOM.height,
  windows: [
    {
      wall: 'north',
      x: 0,
      y: WINDOW.sill,
      w: WINDOW.width,
      h: WINDOW.height,
    },
  ],
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function clampRoomGeometry(geom: RoomGeometry): RoomGeometry {
  const width = clamp(geom.width, 60, 360);
  const depth = clamp(geom.depth, 60, 480);
  const height = clamp(geom.height, 72, 144);
  const windows = geom.windows.map((w) => ({
    wall: w.wall,
    x: w.x,
    y: clamp(w.y, 0, height - 12),
    w: clamp(w.w, 12, width - 8),
    h: clamp(w.h, 12, height - w.y),
  }));
  return { width, depth, height, windows };
}

export function parseRoomGeometry(raw: unknown): RoomGeometry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.width !== 'number' || typeof o.depth !== 'number' || typeof o.height !== 'number') {
    return null;
  }
  if (!Array.isArray(o.windows)) return null;
  const windows: RoomWindow[] = [];
  for (const entry of o.windows) {
    if (!entry || typeof entry !== 'object') continue;
    const w = entry as Record<string, unknown>;
    const wall = w.wall;
    if (wall !== 'north' && wall !== 'south' && wall !== 'east' && wall !== 'west') continue;
    if (typeof w.x !== 'number' || typeof w.y !== 'number') continue;
    if (typeof w.w !== 'number' || typeof w.h !== 'number') continue;
    windows.push({ wall, x: w.x, y: w.y, w: w.w, h: w.h });
  }
  return clampRoomGeometry({
    width: o.width,
    depth: o.depth,
    height: o.height,
    windows,
  });
}

export interface WindowWorldPlacement {
  cx: number;
  cy: number;
  cz: number;
  outward: [number, number, number];
  w: number;
  h: number;
}

/** World-space center and outward normal for a window opening. */
export function windowWorldPlacement(
  geom: RoomGeometry,
  win: RoomWindow,
): WindowWorldPlacement {
  const cy = win.y + win.h / 2;
  switch (win.wall) {
    case 'north':
      return {
        cx: geom.width / 2 + win.x,
        cy,
        cz: geom.depth,
        outward: [0, 0, 1],
        w: win.w,
        h: win.h,
      };
    case 'south':
      return {
        cx: geom.width / 2 + win.x,
        cy,
        cz: 0,
        outward: [0, 0, -1],
        w: win.w,
        h: win.h,
      };
    case 'west':
      return {
        cx: 0,
        cy,
        cz: geom.depth / 2 + win.x,
        outward: [-1, 0, 0],
        w: win.w,
        h: win.h,
      };
    case 'east':
      return {
        cx: geom.width,
        cy,
        cz: geom.depth / 2 + win.x,
        outward: [1, 0, 0],
        w: win.w,
        h: win.h,
      };
  }
}

export function wallLength(geom: RoomGeometry, wall: WallId): number {
  return wall === 'north' || wall === 'south' ? geom.width : geom.depth;
}

export function holesForWall(geom: RoomGeometry, wall: WallId) {
  return geom.windows
    .filter((w) => w.wall === wall)
    .map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h }));
}
