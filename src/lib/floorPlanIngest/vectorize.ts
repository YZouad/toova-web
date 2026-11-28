import { estimateStrokeThickness } from './wallMask';
import type { BinaryMask, PixelSegment } from './types';

function idx(w: number, x: number, y: number): number {
  return y * w + x;
}

function segLen(s: PixelSegment): number {
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  return Math.hypot(dx, dy);
}

function mergeCollinear(segments: PixelSegment[], thickness: number): PixelSegment[] {
  const tol = Math.max(thickness / 2, 3);
  const out: PixelSegment[] = [];

  const horiz = segments.filter((s) => Math.abs(s.y0 - s.y1) < 1 && Math.abs(s.x0 - s.x1) >= 1);
  const vert = segments.filter((s) => Math.abs(s.x0 - s.x1) < 1 && Math.abs(s.y0 - s.y1) >= 1);
  const diag = segments.filter((s) => !horiz.includes(s) && !vert.includes(s));

  const mergeAxis = (list: PixelSegment[], axis: 'h' | 'v'): PixelSegment[] => {
    list.sort((a, b) => (axis === 'h' ? a.y0 - b.y0 || a.x0 - b.x0 : a.x0 - b.x0 || a.y0 - b.y0));
    const merged: PixelSegment[] = [];
    for (const s of list) {
      let found = false;
      for (let i = 0; i < merged.length; i += 1) {
        const m = merged[i]!;
        if (axis === 'h') {
          if (Math.abs(m.y0 - s.y0) <= tol) {
            const lo = Math.min(m.x0, m.x1, s.x0, s.x1);
            const hi = Math.max(m.x0, m.x1, s.x0, s.x1);
            if (hi - lo <= (Math.max(m.x1, m.x0) - Math.min(m.x0, m.x1)) + (Math.max(s.x1, s.x0) - Math.min(s.x0, s.x1)) + tol) {
              merged[i] = { ...m, x0: lo, x1: hi, y0: (m.y0 + s.y0) / 2, y1: (m.y1 + s.y1) / 2 };
              found = true;
              break;
            }
          }
        } else if (Math.abs(m.x0 - s.x0) <= tol) {
          const lo = Math.min(m.y0, m.y1, s.y0, s.y1);
          const hi = Math.max(m.y0, m.y1, s.y0, s.y1);
          if (hi - lo <= (Math.max(m.y1, m.y0) - Math.min(m.y0, m.y1)) + (Math.max(s.y1, s.y0) - Math.min(s.y0, s.y1)) + tol) {
            merged[i] = { ...m, y0: lo, y1: hi, x0: (m.x0 + s.x0) / 2, x1: (m.x1 + s.x1) / 2 };
            found = true;
            break;
          }
        }
      }
      if (!found) merged.push({ ...s });
    }
    return merged;
  };

  out.push(...mergeAxis(horiz, 'h'));
  out.push(...mergeAxis(vert, 'v'));
  out.push(...diag);
  return out;
}

function coveredBySegment(
  mask: BinaryMask,
  covered: Uint8Array,
  s: PixelSegment,
  half: number,
): void {
  const { width: w } = mask;
  const xmin = Math.floor(Math.min(s.x0, s.x1) - half);
  const xmax = Math.ceil(Math.max(s.x0, s.x1) + half);
  const ymin = Math.floor(Math.min(s.y0, s.y1) - half);
  const ymax = Math.ceil(Math.max(s.y0, s.y1) + half);
  const horiz = Math.abs(s.y0 - s.y1) < 1;
  const vert = Math.abs(s.x0 - s.x1) < 1;
  for (let y = Math.max(0, ymin); y < Math.min(mask.height, ymax); y += 1) {
    for (let x = Math.max(0, xmin); x < Math.min(mask.width, xmax); x += 1) {
      if (horiz) {
        const cy = (s.y0 + s.y1) / 2;
        if (x >= Math.min(s.x0, s.x1) - half && x <= Math.max(s.x0, s.x1) + half && Math.abs(y - cy) <= half) {
          covered[idx(w, x, y)] = 1;
        }
      } else if (vert) {
        const cx = (s.x0 + s.x1) / 2;
        if (y >= Math.min(s.y0, s.y1) - half && y <= Math.max(s.y0, s.y1) + half && Math.abs(x - cx) <= half) {
          covered[idx(w, x, y)] = 1;
        }
      }
    }
  }
}

function horizontalRuns(mask: BinaryMask, thickness: number, minSpan: number): PixelSegment[] {
  const { width: w, height: h, data } = mask;
  const segments: PixelSegment[] = [];
  const bandTol = Math.max(2, Math.ceil(thickness));

  for (let y = 0; y < h; y += 1) {
    let x0 = -1;
    for (let x = 0; x <= w; x += 1) {
      const on = x < w && data[idx(w, x, y)]!;
      if (on && x0 < 0) x0 = x;
      if ((!on || x === w) && x0 >= 0) {
        const x1 = x - 1;
        const len = x1 - x0 + 1;
        if (len >= Math.max(4, thickness)) {
          segments.push({ x0, y0: y, x1, y1: y, thickness });
        }
        x0 = -1;
      }
    }
  }

  const bands: { y: number; segs: PixelSegment[] }[] = [];
  for (const s of segments) {
    const cy = s.y0;
    let band = bands.find((b) => Math.abs(b.y - cy) <= bandTol);
    if (!band) {
      band = { y: cy, segs: [] };
      bands.push(band);
    } else {
      band.y = (band.y * band.segs.length + cy) / (band.segs.length + 1);
    }
    band.segs.push(s);
  }

  const centerlines: PixelSegment[] = [];
  for (const band of bands) {
    const yMid = Math.round(band.y);
    const xs = band.segs.flatMap((s) => [s.x0, s.x1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    if (x1 - x0 >= minSpan) {
      centerlines.push({
        x0,
        y0: yMid,
        x1,
        y1: yMid,
        thickness,
      });
    }
  }
  return centerlines;
}

function verticalRuns(mask: BinaryMask, thickness: number, minSpan: number): PixelSegment[] {
  const { width: w, height: h, data } = mask;
  const segments: PixelSegment[] = [];
  const bandTol = Math.max(2, Math.ceil(thickness));

  for (let x = 0; x < w; x += 1) {
    let y0 = -1;
    for (let y = 0; y <= h; y += 1) {
      const on = y < h && data[idx(w, x, y)]!;
      if (on && y0 < 0) y0 = y;
      if ((!on || y === h) && y0 >= 0) {
        const y1 = y - 1;
        const len = y1 - y0 + 1;
        if (len >= Math.max(4, thickness)) {
          segments.push({ x0: x, y0, x1: x, y1, thickness });
        }
        y0 = -1;
      }
    }
  }

  const bands: { x: number; segs: PixelSegment[] }[] = [];
  for (const s of segments) {
    const cx = s.x0;
    let band = bands.find((b) => Math.abs(b.x - cx) <= bandTol);
    if (!band) {
      band = { x: cx, segs: [] };
      bands.push(band);
    } else {
      band.x = (band.x * band.segs.length + cx) / (band.segs.length + 1);
    }
    band.segs.push(s);
  }

  const centerlines: PixelSegment[] = [];
  for (const band of bands) {
    const xMid = Math.round(band.x);
    const ys = band.segs.flatMap((s) => [s.y0, s.y1]);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    if (y1 - y0 >= minSpan) {
      centerlines.push({
        x0: xMid,
        y0,
        x1: xMid,
        y1,
        thickness,
      });
    }
  }
  return centerlines;
}

function connectedComponents(mask: BinaryMask, seed: Uint8Array): PixelSegment[] {
  const { width: w, height: h, data } = mask;
  const visited = new Uint8Array(data.length);
  const segments: PixelSegment[] = [];

  const neighbors = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
  ];

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = idx(w, x, y);
      if (!data[i] || seed[i] || visited[i]) continue;
      const stack = [[x, y]];
      visited[i] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let sumXX = 0;
      let sumYY = 0;
      let sumXY = 0;

      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        count += 1;
        sumX += cx;
        sumY += cy;
        sumXX += cx * cx;
        sumYY += cy * cy;
        sumXY += cx * cy;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of neighbors) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = idx(w, nx, ny);
          if (!data[ni] || seed[ni] || visited[ni]) continue;
          visited[ni] = 1;
          stack.push([nx, ny]);
        }
      }

      if (count < 4) continue;

      const meanX = sumX / count;
      const meanY = sumY / count;
      const cxx = sumXX / count - meanX * meanX;
      const cyy = sumYY / count - meanY * meanY;
      const cxy = sumXY / count - meanX * meanY;
      const trace = cxx + cyy;
      const det = cxx * cyy - cxy * cxy;
      const lambda1 = trace / 2 + Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
      let dx = cxy;
      let dy = lambda1 - cxx;
      if (Math.hypot(dx, dy) < 1e-6) {
        dx = lambda1 - cyy;
        dy = cxy;
      }
      const norm = Math.hypot(dx, dy) || 1;
      dx /= norm;
      dy /= norm;

      const corners: [number, number][] = [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
      ];
      let bestLen = 0;
      let p0: [number, number] = corners[0]!;
      let p1: [number, number] = corners[1]!;
      for (let a = 0; a < corners.length; a += 1) {
        for (let b = a + 1; b < corners.length; b += 1) {
          const d = Math.hypot(corners[a]![0] - corners[b]![0], corners[a]![1] - corners[b]![1]);
          if (d > bestLen) {
            bestLen = d;
            p0 = corners[a]!;
            p1 = corners[b]!;
          }
        }
      }

      const diagLen = Math.hypot(maxX - minX, maxY - minY);
      const useDiag = diagLen > bestLen * 0.9;
      segments.push({
        x0: useDiag ? minX : p0[0],
        y0: useDiag ? minY : p0[1],
        x1: useDiag ? maxX : p1[0],
        y1: useDiag ? maxY : p1[1],
        confidence: 0.5,
      });
    }
  }
  return segments;
}

function bboxFrameSegments(mask: BinaryMask, thickness: number): PixelSegment[] {
  const { width: w, height: h, data } = mask;
  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  let any = false;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!data[idx(w, x, y)]) continue;
      any = true;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (!any) return [];
  const half = thickness / 2;
  const x0 = minX + half;
  const x1 = maxX - half;
  const y0 = minY + half;
  const y1 = maxY - half;
  if (x1 - x0 < 4 || y1 - y0 < 4) return [];
  return [
    { x0, x1, y0, y1: y0, thickness },
    { x0, x1, y0: y1, y1, thickness },
    { x0, x1: x0, y0, y1, thickness },
    { x0: x1, x1, y0, y1, thickness },
  ];
}

export function vectorizeWalls(wall: BinaryMask): PixelSegment[] {
  const thickness = estimateStrokeThickness(wall);
  let half = thickness / 2;
  const minHoriz = Math.max(thickness * 3, wall.width * 0.35);
  const minVert = Math.max(thickness * 3, wall.height * 0.35);
  const runs = [
    ...horizontalRuns(wall, thickness, minHoriz),
    ...verticalRuns(wall, thickness, minVert),
  ];

  for (const s of runs) {
    if (s.thickness) half = Math.max(half, s.thickness / 2);
  }

  const covered = new Uint8Array(wall.data.length);
  for (const s of runs) {
    coveredBySegment(wall, covered, s, half);
  }

  const remaining = new Uint8Array(wall.data.length);
  for (let i = 0; i < wall.data.length; i += 1) {
    remaining[i] = wall.data[i]! && !covered[i]! ? 1 : 0;
  }
  const remainMask: BinaryMask = { width: wall.width, height: wall.height, data: remaining };
  const diags = runs.length >= 4 ? [] : connectedComponents(remainMask, covered);

  let all = mergeCollinear([...runs, ...diags], thickness);
  const minLen = Math.max(4, thickness);
  all = all.filter((s) => segLen(s) >= minLen);
  const frame = bboxFrameSegments(wall, thickness);
  const horizN = all.filter((s) => Math.abs(s.y0 - s.y1) < 2).length;
  const vertN = all.filter((s) => Math.abs(s.x0 - s.x1) < 2).length;
  if (frame.length === 4 && (horizN !== 2 || vertN !== 2)) return frame;
  return all;
}