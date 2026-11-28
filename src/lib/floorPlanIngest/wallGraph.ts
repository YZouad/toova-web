import type { PixelGap, PixelGraph, PixelSegment } from './types';

function isHorizontal(s: PixelSegment): boolean {
  return Math.abs(s.y0 - s.y1) < 2;
}

function isVertical(s: PixelSegment): boolean {
  return Math.abs(s.x0 - s.x1) < 2;
}

function clusterValues(values: number[], snapPx: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const centers: number[] = [];
  for (const v of sorted) {
    const near = centers.find((c) => Math.abs(c - v) <= snapPx);
    if (near !== undefined) {
      const i = centers.indexOf(near);
      centers[i] = (near * 2 + v) / 3;
    } else {
      centers.push(v);
    }
  }
  return centers;
}

function snapToCluster(v: number, centers: number[]): number {
  let best = v;
  let dMin = snapDist(centers, v);
  for (const c of centers) {
    const d = Math.abs(c - v);
    if (d < dMin) {
      dMin = d;
      best = c;
    }
  }
  return best;
}

function snapDist(centers: number[], v: number): number {
  if (centers.length === 0) return Infinity;
  return Math.min(...centers.map((c) => Math.abs(c - v)));
}

function snapSegment(
  s: PixelSegment,
  xClusters: number[],
  yClusters: number[],
  snapPx: number,
): PixelSegment {
  if (isHorizontal(s)) {
    const y = snapToCluster((s.y0 + s.y1) / 2, yClusters);
    return {
      ...s,
      x0: snapToCluster(s.x0, xClusters),
      x1: snapToCluster(s.x1, xClusters),
      y0: y,
      y1: y,
    };
  }
  if (isVertical(s)) {
    const x = snapToCluster((s.x0 + s.x1) / 2, xClusters);
    return {
      ...s,
      x0: x,
      x1: x,
      y0: snapToCluster(s.y0, yClusters),
      y1: snapToCluster(s.y1, yClusters),
    };
  }
  return { ...s };
}

interface Junction {
  x: number;
  y: number;
}

function collectJunctions(segments: PixelSegment[], snapPx: number): Junction[] {
  const junctions: Junction[] = [];
  const add = (x: number, y: number) => {
    const j = junctions.find((p) => Math.hypot(p.x - x, p.y - y) <= snapPx);
    if (!j) junctions.push({ x, y });
  };
  for (const s of segments) {
    add(s.x0, s.y0);
    add(s.x1, s.y1);
  }
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i]!;
      const b = segments[j]!;
      const pt = segmentIntersection(a, b);
      if (pt) add(pt.x, pt.y);
    }
  }
  return junctions;
}

function segmentIntersection(a: PixelSegment, b: PixelSegment): { x: number; y: number } | null {
  const ah = isHorizontal(a);
  const av = isVertical(a);
  const bh = isHorizontal(b);
  const bv = isVertical(b);
  if (ah && bv) {
    const y = a.y0;
    const x = b.x0;
    if (
      x >= Math.min(a.x0, a.x1) - 1 &&
      x <= Math.max(a.x0, a.x1) + 1 &&
      y >= Math.min(b.y0, b.y1) - 1 &&
      y <= Math.max(b.y0, b.y1) + 1
    ) {
      return { x, y };
    }
  }
  if (av && bh) {
    const x = a.x0;
    const y = b.y0;
    if (
      y >= Math.min(a.y0, a.y1) - 1 &&
      y <= Math.max(a.y0, a.y1) + 1 &&
      x >= Math.min(b.x0, b.x1) - 1 &&
      x <= Math.max(b.x0, b.x1) + 1
    ) {
      return { x, y };
    }
  }
  return null;
}

function splitAtJunctions(seg: PixelSegment, junctions: Junction[], snapPx: number): PixelSegment[] {
  const horiz = isHorizontal(seg);
  const vert = isVertical(seg);
  if (!horiz && !vert) return [seg];

  const cuts: number[] = [horiz ? Math.min(seg.x0, seg.x1) : Math.min(seg.y0, seg.y1)];
  const hi = horiz ? Math.max(seg.x0, seg.x1) : Math.max(seg.y0, seg.y1);
  cuts.push(hi);

  for (const j of junctions) {
    if (horiz) {
      if (Math.abs(j.y - seg.y0) <= snapPx && j.x > cuts[0]! + snapPx && j.x < hi - snapPx) {
        cuts.push(j.x);
      }
    } else if (vert) {
      if (Math.abs(j.x - seg.x0) <= snapPx && j.y > cuts[0]! + snapPx && j.y < hi - snapPx) {
        cuts.push(j.y);
      }
    }
  }
  cuts.sort((a, b) => a - b);

  const parts: PixelSegment[] = [];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const lo = cuts[i]!;
    const hiC = cuts[i + 1]!;
    if (hiC - lo < 2) continue;
    if (horiz) {
      parts.push({ ...seg, x0: lo, x1: hiC, y0: seg.y0, y1: seg.y1 });
    } else {
      parts.push({ ...seg, y0: lo, y1: hiC, x0: seg.x0, x1: seg.x1 });
    }
  }
  return parts.length ? parts : [seg];
}

function detectGapsOnAxis(
  segments: PixelSegment[],
  axis: 'h' | 'v',
  minGap: number,
  maxGap: number,
): Omit<PixelGap, 'id'>[] {
  const groups = new Map<number, PixelSegment[]>();
  for (const s of segments) {
    const key = axis === 'h' ? Math.round((s.y0 + s.y1) / 2) : Math.round((s.x0 + s.x1) / 2);
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const gaps: Omit<PixelGap, 'id'>[] = [];
  for (const [, segs] of groups) {
    const intervals = segs.map((s) =>
      axis === 'h'
        ? { a: Math.min(s.x0, s.x1), b: Math.max(s.x0, s.x1), s }
        : { a: Math.min(s.y0, s.y1), b: Math.max(s.y0, s.y1), s },
    );
    intervals.sort((x, y) => x.a - y.a);
    for (let i = 0; i < intervals.length - 1; i += 1) {
      const gapLen = intervals[i + 1]!.a - intervals[i]!.b;
      if (gapLen >= minGap && gapLen <= maxGap) {
        const s0 = intervals[i]!.s;
        const s1 = intervals[i + 1]!.s;
        if (axis === 'h') {
          const y = (s0.y0 + s0.y1) / 2;
          gaps.push({
            x0: intervals[i]!.b,
            y0: y,
            x1: intervals[i + 1]!.a,
            y1: y,
          });
        } else {
          const x = (s0.x0 + s0.x1) / 2;
          gaps.push({
            x0: x,
            y0: intervals[i]!.b,
            x1: x,
            y1: intervals[i + 1]!.a,
          });
        }
      }
    }
  }
  return gaps;
}

function mergeAxisSegments(segments: PixelSegment[], snapPx: number): PixelSegment[] {
  const horiz = segments.filter(isHorizontal);
  const vert = segments.filter(isVertical);
  const other = segments.filter((s) => !isHorizontal(s) && !isVertical(s));

  const merge = (list: PixelSegment[], axis: 'h' | 'v'): PixelSegment[] => {
    const sorted = [...list].sort((a, b) =>
      axis === 'h'
        ? (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2
        : (a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2,
    );
    const bands: PixelSegment[][] = [];
    for (const s of sorted) {
      const c = axis === 'h' ? (s.y0 + s.y1) / 2 : (s.x0 + s.x1) / 2;
      const thick = s.thickness ?? snapPx;
      const band = bands.find((b) => {
        const bc = axis === 'h' ? (b[0]!.y0 + b[0]!.y1) / 2 : (b[0]!.x0 + b[0]!.x1) / 2;
        return Math.abs(bc - c) <= thick + snapPx;
      });
      if (band) band.push(s);
      else bands.push([s]);
    }
    const out: PixelSegment[] = [];
    for (const segs of bands) {
      const coord = axis === 'h' ? 'x' : 'y';
      const a0 = Math.min(...segs.map((s) => (coord === 'x' ? Math.min(s.x0, s.x1) : Math.min(s.y0, s.y1))));
      const a1 = Math.max(...segs.map((s) => (coord === 'x' ? Math.max(s.x0, s.x1) : Math.max(s.y0, s.y1))));
      const thick = Math.max(...segs.map((s) => s.thickness ?? 0));
      out.push(
        axis === 'h'
          ? { x0: a0, x1: a1, y0: (segs[0]!.y0 + segs[0]!.y1) / 2, y1: (segs[0]!.y0 + segs[0]!.y1) / 2, thickness: thick }
          : { x0: (segs[0]!.x0 + segs[0]!.x1) / 2, x1: (segs[0]!.x0 + segs[0]!.x1) / 2, y0: a0, y1: a1, thickness: thick },
      );
    }
    return out;
  };

  return [...merge(horiz, 'h'), ...merge(vert, 'v'), ...other];
}

function pickOuterRectangle(segments: PixelSegment[]): PixelSegment[] | null {
  const horiz = segments.filter(isHorizontal);
  const vert = segments.filter(isVertical);
  if (horiz.length < 2 || vert.length < 2) return null;
  const widths = horiz.map((s) => Math.abs(s.x1 - s.x0));
  const heights = vert.map((s) => Math.abs(s.y1 - s.y0));
  const minHorizSpan = Math.max(...widths, 0) * 0.55;
  const minVertSpan = Math.max(...heights, 0) * 0.55;
  const longH = horiz.filter((s) => Math.abs(s.x1 - s.x0) >= minHorizSpan);
  const longV = vert.filter((s) => Math.abs(s.y1 - s.y0) >= minVertSpan);
  if (longH.length < 2 || longV.length < 2) return null;
  const top = longH.reduce((a, b) => ((a.y0 + a.y1) / 2 < (b.y0 + b.y1) / 2 ? a : b));
  const bottom = longH.reduce((a, b) => ((a.y0 + a.y1) / 2 > (b.y0 + b.y1) / 2 ? a : b));
  const left = longV.reduce((a, b) => ((a.x0 + a.x1) / 2 < (b.x0 + b.x1) / 2 ? a : b));
  const right = longV.reduce((a, b) => ((a.x0 + a.x1) / 2 > (b.x0 + b.x1) / 2 ? a : b));
  return [top, bottom, left, right];
}

export function buildWallGraph(
  segments: PixelSegment[],
  opts?: { snapPx?: number },
): PixelGraph {
  const snapPx = opts?.snapPx ?? 4;
  const xs = segments.filter(isVertical).map((s) => (s.x0 + s.x1) / 2);
  const ys = segments.filter(isHorizontal).map((s) => (s.y0 + s.y1) / 2);
  const xClusters = clusterValues(xs, snapPx);
  const yClusters = clusterValues(ys, snapPx);

  let snapped = segments.map((s) => snapSegment(s, xClusters, yClusters, snapPx));
  const junctions = collectJunctions(snapped, snapPx * 2);

  for (const j of junctions) {
    snapped = snapped.map((s) => {
      if (isHorizontal(s) && Math.abs(s.y0 - j.y) <= snapPx * 2) {
        const lo = Math.min(s.x0, s.x1);
        const hi = Math.max(s.x0, s.x1);
        if (j.x >= lo - snapPx && j.x <= hi + snapPx) {
          return { ...s, y0: j.y, y1: j.y };
        }
      }
      if (isVertical(s) && Math.abs(s.x0 - j.x) <= snapPx * 2) {
        const lo = Math.min(s.y0, s.y1);
        const hi = Math.max(s.y0, s.y1);
        if (j.y >= lo - snapPx && j.y <= hi + snapPx) {
          return { ...s, x0: j.x, x1: j.x };
        }
      }
      return s;
    });
  }

  const split: PixelSegment[] = [];
  for (const s of snapped) {
    split.push(...splitAtJunctions(s, junctions, snapPx));
  }

  const merged = mergeAxisSegments(split, snapPx);
  let outer = pickOuterRectangle(merged);
  if (outer) {
    const [top, bottom, left, right] = outer;
    const x0 = Math.min(left.x0, left.x1, top.x0, bottom.x0);
    const x1 = Math.max(right.x0, right.x1, top.x1, bottom.x1);
    const y0 = Math.min(top.y0, top.y1, left.y0, right.y0);
    const y1 = Math.max(bottom.y0, bottom.y1, left.y1, right.y1);
    const thick = Math.max(
      top.thickness ?? 0,
      bottom.thickness ?? 0,
      left.thickness ?? 0,
      right.thickness ?? 0,
    );
    outer = [
      { ...top, x0, x1, y0, y1: y0, thickness: thick },
      { ...bottom, x0, x1, y0: y1, y1, thickness: thick },
      { ...left, x0, x1: x0, y0, y1, thickness: thick },
      { ...right, x0: x1, x1, y0, y1, thickness: thick },
    ];
  }
  const core = outer ?? merged;
  const horiz = core.filter(isHorizontal);
  const vert = core.filter(isVertical);
  const other = outer ? [] : merged.filter((s) => !isHorizontal(s) && !isVertical(s));

  const gapParts = [
    ...detectGapsOnAxis(horiz, 'h', 8, 120),
    ...detectGapsOnAxis(vert, 'v', 8, 120),
  ];

  const gaps: PixelGap[] = gapParts.map((g, i) => ({
    ...g,
    id: `g-${i + 1}`,
  }));

  return {
    segments: [...horiz, ...vert, ...other],
    gaps,
    mode: 'solid',
  };
}