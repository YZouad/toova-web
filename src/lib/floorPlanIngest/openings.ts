import type { BinaryMask, PixelGap } from './types';

function idx(w: number, x: number, y: number): number {
  return y * w + x;
}

function gapCenter(g: PixelGap): { cx: number; cy: number } {
  return { cx: (g.x0 + g.x1) / 2, cy: (g.y0 + g.y1) / 2 };
}

function gapIsHorizontal(g: PixelGap): boolean {
  return Math.abs(g.y0 - g.y1) < 2;
}

function thinDensityInRect(
  thin: BinaryMask,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const { width: w, height: h, data } = thin;
  const xmin = Math.max(0, Math.floor(Math.min(x0, x1)));
  const xmax = Math.min(w - 1, Math.ceil(Math.max(x0, x1)));
  const ymin = Math.max(0, Math.floor(Math.min(y0, y1)));
  const ymax = Math.min(h - 1, Math.ceil(Math.max(y0, y1)));
  let on = 0;
  let total = 0;
  for (let y = ymin; y <= ymax; y += 1) {
    for (let x = xmin; x <= xmax; x += 1) {
      total += 1;
      if (data[idx(w, x, y)]) on += 1;
    }
  }
  return total > 0 ? on / total : 0;
}

function arcSweepScore(
  thin: BinaryMask,
  g: PixelGap,
  side: 'start' | 'end',
): number {
  const horiz = gapIsHorizontal(g);
  const { cx, cy } = gapCenter(g);
  const span = horiz ? Math.abs(g.x1 - g.x0) : Math.abs(g.y1 - g.y0);
  const r = span * 0.45;
  if (r < 2) return 0;

  let arcOn = 0;
  let arcTotal = 0;
  const ox = horiz ? (side === 'start' ? g.x0 : g.x1) : cx;
  const oy = horiz ? cy : side === 'start' ? g.y0 : g.y1;

  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy += 1) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx += 1) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r || d2 < (r * 0.3) ** 2) continue;
      const x = Math.round(ox + dx);
      const y = Math.round(oy + dy);
      if (x < 0 || y < 0 || x >= thin.width || y >= thin.height) continue;
      arcTotal += 1;
      if (thin.data[idx(thin.width, x, y)]) arcOn += 1;
    }
  }
  return arcTotal > 0 ? arcOn / arcTotal : 0;
}

function parallelLinesScore(thin: BinaryMask, g: PixelGap): number {
  const horiz = gapIsHorizontal(g);
  const { cx, cy } = gapCenter(g);
  const perpHalf = 6;
  const alongHalf = horiz ? Math.abs(g.x1 - g.x0) / 2 : Math.abs(g.y1 - g.y0) / 2;
  const band1 = horiz
    ? thinDensityInRect(thin, cx - alongHalf, cy - perpHalf - 4, cx + alongHalf, cy - perpHalf)
    : thinDensityInRect(thin, cx - perpHalf - 4, cy - alongHalf, cx - perpHalf, cy + alongHalf);
  const band2 = horiz
    ? thinDensityInRect(thin, cx - alongHalf, cy + perpHalf, cx + alongHalf, cy + perpHalf + 4)
    : thinDensityInRect(thin, cx + perpHalf, cy - alongHalf, cx + perpHalf + 4, cy + alongHalf);
  const mid = horiz
    ? thinDensityInRect(thin, cx - alongHalf, cy - 2, cx + alongHalf, cy + 2)
    : thinDensityInRect(thin, cx - 2, cy - alongHalf, cx + 2, cy + alongHalf);
  if (band1 > 0.15 && band2 > 0.15 && mid < 0.08) {
    return Math.min(0.9, 0.5 + (band1 + band2) / 2);
  }
  return 0;
}

export function classifyGaps(
  gaps: PixelGap[],
  thin: BinaryMask,
  _wall: BinaryMask,
): PixelGap[] {
  return gaps.map((g) => {
    const arcStart = arcSweepScore(thin, g, 'start');
    const arcEnd = arcSweepScore(thin, g, 'end');
    const arcMax = Math.max(arcStart, arcEnd);

    if (arcMax >= 0.12 && arcMax > parallelLinesScore(thin, g)) {
      const hinge: 'left' | 'right' = arcStart >= arcEnd ? 'left' : 'right';
      const confidence = Math.min(0.9, 0.45 + arcMax * 2);
      return { ...g, kindHint: 'door', hinge, confidence };
    }

    const winScore = parallelLinesScore(thin, g);
    if (winScore >= 0.45) {
      return { ...g, kindHint: 'window', confidence: winScore };
    }

    const nearThin = thinDensityInRect(
      thin,
      Math.min(g.x0, g.x1) - 4,
      Math.min(g.y0, g.y1) - 4,
      Math.max(g.x0, g.x1) + 4,
      Math.max(g.y0, g.y1) + 4,
    );
  const confidence = nearThin > 0.05 ? 0.55 : 0.4;
    return { ...g, kindHint: 'opening', confidence };
  });
}