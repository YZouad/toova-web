import type { BinaryMask, PixelGap, PixelGraph } from './types';

export interface FaceMark {
  id: string;
  cx: number;
  cy: number;
  polygon: { x: number; y: number }[];
}

function idx(w: number, x: number, y: number): number {
  return y * w + x;
}

export function assignFaceMarks(
  graph: PixelGraph,
  wall: BinaryMask,
): FaceMark[] {
  const { width: w, height: h } = wall;
  const cell = 8;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const blocked = new Uint8Array(cols * rows);

  const blockLine = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) {
        blocked[cy * cols + cx] = 1;
      }
    }
  };

  for (const s of graph.segments) {
    blockLine(s.x0, s.y0, s.x1, s.y1);
  }

  const visited = new Uint8Array(cols * rows);
  const faces: FaceMark[] = [];
  let faceId = 0;

  const flood = (sc: number, sr: number): { xs: number[]; ys: number[] } => {
    const stack: [number, number][] = [[sc, sr]];
    const xs: number[] = [];
    const ys: number[] = [];
    visited[sr * cols + sc] = 1;
    while (stack.length) {
      const [c, r] = stack.pop()!;
      xs.push(c);
      ys.push(r);
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = nr * cols + nc;
        if (visited[ni] || blocked[ni]) continue;
        visited[ni] = 1;
        stack.push([nc, nr]);
      }
    }
    return { xs, ys };
  };

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      if (visited[i] || blocked[i]) continue;
      const region = flood(c, r);
      if (region.xs.length < 4) continue;
      const minC = Math.min(...region.xs);
      const maxC = Math.max(...region.xs);
      const minR = Math.min(...region.ys);
      const maxR = Math.max(...region.ys);
      const cx = ((minC + maxC + 1) / 2) * cell;
      const cy = ((minR + maxR + 1) / 2) * cell;
      const wi = Math.min(w - 1, Math.max(0, Math.round(cx)));
      const hi = Math.min(h - 1, Math.max(0, Math.round(cy)));
      if (!wall.data[idx(w, wi, hi)]) {
        faceId += 1;
        const poly = [
          { x: minC * cell, y: minR * cell },
          { x: (maxC + 1) * cell, y: minR * cell },
          { x: (maxC + 1) * cell, y: (maxR + 1) * cell },
          { x: minC * cell, y: (maxR + 1) * cell },
        ];
        faces.push({ id: `f-${faceId}`, cx, cy, polygon: poly });
      }
    }
  }

  return faces;
}

export function buildMarkList(
  faces: FaceMark[],
  gaps: PixelGap[],
): {
  faces: { id: string; cx: number; cy: number }[];
  gaps: { id: string; cx: number; cy: number }[];
} {
  return {
    faces: faces.map((f) => ({ id: f.id, cx: f.cx, cy: f.cy })),
    gaps: gaps.map((g) => ({
      id: g.id,
      cx: (g.x0 + g.x1) / 2,
      cy: (g.y0 + g.y1) / 2,
    })),
  };
}