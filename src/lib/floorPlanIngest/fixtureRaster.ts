import type { FloorPlan } from '../floorPlanGeometry';
import { getWallSegment } from '../floorPlanGeometry';
import type { GrayImage } from './types';

function setGray(data: Uint8Array, w: number, x: number, y: number, v: number) {
  if (x < 0 || y < 0) return;
  data[y * w + x] = v;
}

function strokeLine(
  data: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  val: number,
) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const r = Math.floor(thickness / 2);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) setGray(data, w, nx, ny, val);
      }
    }
  }
}

function fillRect(
  data: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  val: number,
) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (x >= 0 && y >= 0 && x < w && y < h) setGray(data, w, x, y, val);
    }
  }
}

export function rasterizePlanStyle(
  plan: FloorPlan,
  style: 'solid' | 'hollow' | 'grey',
  pxPerIn: number,
): { gray: GrayImage; rgba: Uint8ClampedArray } {
  const pad = 8;
  let maxX = pad;
  let maxY = pad;
  for (const v of plan.vertices) {
    maxX = Math.max(maxX, Math.round(v.x * pxPerIn) + pad);
    maxY = Math.max(maxY, Math.round(v.z * pxPerIn) + pad);
  }
  const width = maxX + pad;
  const height = maxY + pad;
  const grayData = new Uint8Array(width * height);
  grayData.fill(255);

  const thickness = Math.max(3, Math.round(pxPerIn * 0.25));
  const ink = 20;

  for (const wall of plan.walls) {
    const seg = getWallSegment(plan, wall);
    if (!seg) continue;
    const x0 = Math.round(seg.start.x * pxPerIn);
    const y0 = Math.round(seg.start.z * pxPerIn);
    const x1 = Math.round(seg.end.x * pxPerIn);
    const y1 = Math.round(seg.end.z * pxPerIn);
    if (style === 'hollow') {
      const off = Math.ceil(thickness * 0.6);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * off;
      const ny = (dx / len) * off;
      strokeLine(grayData, width, height, x0 + nx, y0 + ny, x1 + nx, y1 + ny, 2, ink);
      strokeLine(grayData, width, height, x0 - nx, y0 - ny, x1 - nx, y1 - ny, 2, ink);
    } else if (style === 'solid') {
      strokeLine(grayData, width, height, x0, y0, x1, y1, thickness, ink);
    } else {
      strokeLine(grayData, width, height, x0, y0, x1, y1, 1, 120);
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < grayData.length; i += 1) {
    const g = grayData[i]!;
    const o = i * 4;
    rgba[o] = g;
    rgba[o + 1] = g;
    rgba[o + 2] = g;
    rgba[o + 3] = 255;
  }

  return { gray: { width, height, data: grayData }, rgba };
}

/** Draw a axis-aligned rectangle wall outline for tests. */
export function syntheticRectangleGray(
  width: number,
  height: number,
  wallThickness: number,
  hollow: boolean,
): GrayImage {
  const data = new Uint8Array(width * height);
  data.fill(255);
  const ink = 15;
  const t = wallThickness;
  const innerL = t;
  const innerR = width - t - 1;
  const innerT = t;
  const innerB = height - t - 1;

  if (hollow) {
    fillRect(data, width, height, innerL, innerT, innerR, innerT + 1, ink);
    fillRect(data, width, height, innerL, innerB - 1, innerR, innerB, ink);
    fillRect(data, width, height, innerL, innerT, innerL + 1, innerB, ink);
    fillRect(data, width, height, innerR - 1, innerT, innerR, innerB, ink);
    fillRect(data, width, height, innerL + 2, innerT + 2, innerR - 2, innerT + 3, ink);
    fillRect(data, width, height, innerL + 2, innerB - 3, innerR - 2, innerB - 2, ink);
    fillRect(data, width, height, innerL + 2, innerT + 2, innerL + 3, innerB - 2, ink);
    fillRect(data, width, height, innerR - 3, innerT + 2, innerR - 2, innerB - 2, ink);
  } else {
    fillRect(data, width, height, 0, 0, width - 1, t, ink);
    fillRect(data, width, height, 0, height - t, width - 1, height - 1, ink);
    fillRect(data, width, height, 0, 0, t, height - 1, ink);
    fillRect(data, width, height, width - t, 0, width - 1, height - 1, ink);
  }

  return { width, height, data };
}