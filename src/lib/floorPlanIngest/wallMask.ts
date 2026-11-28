import { close, countOn, maskAndNot, open, thresholdGray } from './raster';
import type { BinaryMask, GrayImage } from './types';

function idx(w: number, x: number, y: number): number {
  return y * w + x;
}

export function estimateStrokeThickness(mask: BinaryMask): number {
  const { width: w, height: h, data } = mask;
  const samples: number[] = [];
  const maxStroke = Math.max(8, Math.min(40, Math.round(Math.min(w, h) * 0.08)));

  const noteRun = (run: number) => {
    if (run >= 2 && run <= maxStroke) samples.push(run);
  };

  for (let y = 0; y < h; y += 1) {
    let run = 0;
    for (let x = 0; x <= w; x += 1) {
      const on = x < w && data[idx(w, x, y)]!;
      if (on) {
        run += 1;
      } else if (run > 0) {
        noteRun(run);
        run = 0;
      }
    }
  }

  for (let x = 0; x < w; x += 1) {
    let run = 0;
    for (let y = 0; y <= h; y += 1) {
      const on = y < h && data[idx(w, x, y)]!;
      if (on) {
        run += 1;
      } else if (run > 0) {
        noteRun(run);
        run = 0;
      }
    }
  }

  if (samples.length === 0) return 4;

  samples.sort((a, b) => a - b);
  const mid = samples[Math.floor(samples.length / 2)] ?? 4;
  return Math.min(40, Math.max(2, mid));
}

function borderOffFraction(mask: BinaryMask): number {
  const { width: w, height: h, data } = mask;
  let border = 0;
  let borderOff = 0;
  for (let x = 0; x < w; x += 1) {
    border += 2;
    if (!data[idx(w, x, 0)]) borderOff += 1;
    if (!data[idx(w, x, h - 1)]) borderOff += 1;
  }
  for (let y = 1; y < h - 1; y += 1) {
    border += 2;
    if (!data[idx(w, 0, y)]) borderOff += 1;
    if (!data[idx(w, w - 1, y)]) borderOff += 1;
  }
  return border > 0 ? borderOff / border : 0.5;
}

export function extractWallMask(gray: GrayImage): {
  wall: BinaryMask;
  thin: BinaryMask;
  mode: 'solid' | 'hollow';
} {
  let raw = thresholdGray(gray);
  if (borderOffFraction(raw) < 0.5) {
    const inverted: BinaryMask = {
      width: raw.width,
      height: raw.height,
      data: raw.data.map((v) => (v ? 0 : 1)),
    };
    raw = inverted;
  }

  const t = estimateStrokeThickness(raw);
  const openSize = Math.max(3, 2 * Math.floor(t / 4) + 1);
  const preCount = countOn(raw);
  const opened = open(raw, openSize);
  const postOpenCount = countOn(opened);
  const totalPx = raw.width * raw.height;

  let wall: BinaryMask;
  let mode: 'solid' | 'hollow';

  if (postOpenCount < totalPx * 0.005 || postOpenCount < preCount * 0.3) {
    mode = 'hollow';
    const closeSize = Math.max(3, 2 * Math.floor(t / 2) + 1);
    wall = open(close(raw, closeSize), openSize);
  } else {
    mode = 'solid';
    wall = opened;
  }

  const thin = maskAndNot(raw, wall);
  return { wall, thin, mode };
}