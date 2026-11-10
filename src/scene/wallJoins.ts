import type { WallSegment } from '../lib/roomGeometry';

/**
 * How far a wall end moves along the segment.
 * Positive stops short of the vertex (butt into a neighbor).
 * Negative runs past the vertex (this wall owns the corner).
 */
export type WallEndTrim = { start: number; end: number };

type V2 = [number, number];

type Incident = {
  index: number;
  at: 'start' | 'end';
  /** From the vertex, into the wall. */
  dir: V2;
  length: number;
};

const COLLINEAR_DOT = -0.996;
const MIN_BODY = 2;

/** Sink a butt or straight joint slightly into its neighbor so the seam doesn't crack. */
export const WALL_JOINT_EMBED = 0.2;

export function embedWallTrim(trim: WallEndTrim): WallEndTrim {
  return {
    start: trim.start >= 0 ? trim.start - WALL_JOINT_EMBED : trim.start,
    end: trim.end >= 0 ? trim.end - WALL_JOINT_EMBED : trim.end,
  };
}

/**
 * Butt-join wall slabs so corners and T-junctions don't run through each other.
 *
 * Extending every slab by half a thickness fills interior cracks, but in the
 * dollhouse those overlaps read as crossed sheets. One wall owns each corner
 * and the others stop on its face. Collinear runs meet flush at the vertex.
 */
export function wallEndTrims(segments: WallSegment[], thickness: number): WallEndTrim[] {
  const h = thickness / 2;
  const trims: WallEndTrim[] = segments.map(() => ({ start: 0, end: 0 }));
  const groups = new Map<string, Incident[]>();

  segments.forEach((seg, index) => {
    const startDir: V2 = [seg.tangent[0], seg.tangent[1]];
    const endDir: V2 = [-seg.tangent[0], -seg.tangent[1]];
    pushIncident(groups, seg.start.id, { index, at: 'start', dir: startDir, length: seg.length });
    pushIncident(groups, seg.end.id, { index, at: 'end', dir: endDir, length: seg.length });
  });

  for (const incidents of groups.values()) {
    if (incidents.length < 2) {
      for (const inc of incidents) setTrim(trims, segments, inc, -h);
      continue;
    }

    const through = longestCollinearPair(incidents);
    const throughSet = new Set<number>();
    if (through) {
      throughSet.add(through.i);
      throughSet.add(through.j);
    }

    const obstacles: V2[][] = [];
    for (let i = 0; i < incidents.length; i++) {
      if (!throughSet.has(i)) continue;
      const inc = incidents[i]!;
      // Through-walls already have trim 0 at this vertex.
      obstacles.push(quadForIncident(segments[inc.index]!, trims[inc.index]!, inc.at, 0, h));
    }

    const stems = incidents
      .map((inc, i) => ({ inc, i }))
      .filter(({ i }) => !throughSet.has(i))
      .sort((a, b) => b.inc.length - a.inc.length || a.inc.index - b.inc.index);

    const cornerWinner = throughSet.size === 0;
    stems.forEach(({ inc }, order) => {
      if (cornerWinner && order === 0) {
        setTrim(trims, segments, inc, -h);
        obstacles.push(quadForIncident(segments[inc.index]!, trims[inc.index]!, inc.at, trims[inc.index]![inc.at === 'start' ? 'start' : 'end'], h));
        return;
      }
      const V = vertexOf(segments[inc.index]!, inc.at);
      let tCut = 0;
      for (const rect of obstacles) {
        tCut = Math.max(tCut, clearanceAlong(V, inc.dir, h, rect));
      }
      setTrim(trims, segments, inc, tCut);
      obstacles.push(quadForIncident(segments[inc.index]!, trims[inc.index]!, inc.at, trims[inc.index]![inc.at], h));
    });
  }

  for (let i = 0; i < segments.length; i++) {
    const len = segments[i]!.length;
    const trim = trims[i]!;
    const overflow = trim.start + trim.end - (len - MIN_BODY);
    if (overflow <= 0) continue;
    const pos = Math.max(0, trim.start) + Math.max(0, trim.end);
    if (pos <= 1e-6) continue;
    const keep = Math.max(0, pos - overflow) / pos;
    if (trim.start > 0) trim.start *= keep;
    if (trim.end > 0) trim.end *= keep;
  }

  return trims;
}

/** Local-X span of a trimmed wall. x = 0 is the segment midpoint, matching opening holes. */
export function localSpanForTrim(seg: WallSegment, trim: WallEndTrim): { x0: number; x1: number } {
  const sign = localXSign(seg);
  const half = seg.length / 2;
  const startLocal = -sign * half;
  const endLocal = sign * half;
  const a = startLocal + sign * trim.start;
  const b = endLocal - sign * trim.end;
  return { x0: Math.min(a, b), x1: Math.max(a, b) };
}

/** Solid local-X spans after cutting door intervals out of [x0, x1]. */
export function spansMinusDoors(
  x0: number,
  x1: number,
  doors: { x: number; w: number }[],
): [number, number][] {
  const gaps = doors
    .map((d) => [d.x - d.w / 2, d.x + d.w / 2] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cursor = x0;
  for (const [lo, hi] of gaps) {
    const a = Math.max(lo, x0);
    const b = Math.min(hi, x1);
    if (a > cursor + 0.25) out.push([cursor, Math.min(a, x1)]);
    cursor = Math.max(cursor, b);
  }
  if (x1 > cursor + 0.25) out.push([cursor, x1]);
  return out.filter(([a, b]) => b - a > 0.25);
}

/** World-space footprint of a trimmed slab, centered on the wall centerline. */
export function wallFootprint(seg: WallSegment, trim: WallEndTrim, thickness: number): V2[] {
  return slabQuad(seg, trim.start, trim.end, thickness / 2);
}

/** Local wall point (x along the mesh, z through the thickness from the inner face) to world XZ. */
export function wallLocalToWorld(seg: WallSegment, lx: number, lz: number): V2 {
  const cos = Math.cos(seg.rotationY);
  const sin = Math.sin(seg.rotationY);
  return [
    seg.innerFaceCenter[0] + lx * cos + lz * sin,
    seg.innerFaceCenter[2] - lx * sin + lz * cos,
  ];
}

function localXSign(seg: WallSegment): number {
  const [ox, oz] = seg.outward;
  const [tx, tz] = seg.tangent;
  return oz * tx - ox * tz >= 0 ? 1 : -1;
}

function pushIncident(groups: Map<string, Incident[]>, id: string, inc: Incident) {
  const list = groups.get(id);
  if (list) list.push(inc);
  else groups.set(id, [inc]);
}

function vertexOf(seg: WallSegment, at: 'start' | 'end'): V2 {
  const v = at === 'start' ? seg.start : seg.end;
  return [v.x, v.z];
}

function setTrim(trims: WallEndTrim[], segments: WallSegment[], inc: Incident, value: number) {
  const trim = trims[inc.index]!;
  const other = inc.at === 'start' ? trim.end : trim.start;
  const maxThis = segments[inc.index]!.length - other - MIN_BODY;
  const next = value < 0 ? value : Math.min(value, Math.max(0, maxThis));
  if (inc.at === 'start') trim.start = next;
  else trim.end = next;
}

function longestCollinearPair(incidents: Incident[]): { i: number; j: number } | null {
  let best: { i: number; j: number; len: number; dot: number } | null = null;
  for (let i = 0; i < incidents.length; i++) {
    for (let j = i + 1; j < incidents.length; j++) {
      const d = incidents[i]!.dir[0] * incidents[j]!.dir[0] + incidents[i]!.dir[1] * incidents[j]!.dir[1];
      if (d > COLLINEAR_DOT) continue;
      const len = incidents[i]!.length + incidents[j]!.length;
      if (!best || len > best.len || (len === best.len && d < best.dot)) {
        best = { i, j, len, dot: d };
      }
    }
  }
  return best ? { i: best.i, j: best.j } : null;
}

function quadForIncident(
  seg: WallSegment,
  trim: WallEndTrim,
  at: 'start' | 'end',
  trimAtEnd: number,
  h: number,
): V2[] {
  const start = at === 'start' ? trimAtEnd : trim.start;
  const end = at === 'end' ? trimAtEnd : trim.end;
  return slabQuad(seg, start, end, h);
}

function slabQuad(seg: WallSegment, trimStart: number, trimEnd: number, h: number): V2[] {
  const tx = seg.tangent[0];
  const tz = seg.tangent[1];
  const px = -tz;
  const pz = tx;
  const ax = seg.start.x + tx * trimStart;
  const az = seg.start.z + tz * trimStart;
  const bx = seg.end.x - tx * trimEnd;
  const bz = seg.end.z - tz * trimEnd;
  // CCW in the XZ plane (interior on the left).
  return [
    [ax - px * h, az - pz * h],
    [bx - px * h, bz - pz * h],
    [bx + px * h, bz + pz * h],
    [ax + px * h, az + pz * h],
  ];
}

/** Largest distance along `dir` where `rect` still sits inside the wall's thickness strip. */
function clearanceAlong(origin: V2, dir: V2, h: number, rect: V2[]): number {
  const nx = -dir[1];
  const nz = dir[0];
  const ox = origin[0];
  const oz = origin[1];
  const baseN = nx * ox + nz * oz;
  let clipped = clipHalfPlane(rect, nx, nz, baseN + h);
  clipped = clipHalfPlane(clipped, -nx, -nz, -baseN + h);
  if (clipped.length === 0) return 0;
  let maxT = 0;
  for (const p of clipped) {
    const t = (p[0] - ox) * dir[0] + (p[1] - oz) * dir[1];
    if (t > maxT) maxT = t;
  }
  return maxT;
}

function clipHalfPlane(poly: V2[], nx: number, ny: number, c: number): V2[] {
  if (poly.length === 0) return [];
  const out: V2[] = [];
  const side = (p: V2) => nx * p[0] + ny * p[1] - c;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const sa = side(a);
    const sb = side(b);
    const ain = sa <= 1e-6;
    const bin = sb <= 1e-6;
    if (ain && bin) {
      out.push(b);
    } else if (ain && !bin) {
      const hit = edgeHit(a, b, sa, sb);
      if (hit) out.push(hit);
    } else if (!ain && bin) {
      const hit = edgeHit(a, b, sa, sb);
      if (hit) out.push(hit);
      out.push(b);
    }
  }
  return out;
}

function edgeHit(a: V2, b: V2, sa: number, sb: number): V2 | null {
  const denom = sa - sb;
  if (Math.abs(denom) < 1e-12) return null;
  const t = sa / denom;
  if (t < -1e-4 || t > 1 + 1e-4) return null;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function polygonArea(poly: V2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Area of the overlap of two convex polygons. */
export function convexOverlapArea(a: V2[], b: V2[]): number {
  let poly = a;
  for (let i = 0; i < b.length; i++) {
    const p = b[i]!;
    const q = b[(i + 1) % b.length]!;
    const ex = q[0] - p[0];
    const ez = q[1] - p[1];
    poly = clipHalfPlane(poly, ez, -ex, ez * p[0] - ex * p[1]);
    if (poly.length < 3) return 0;
  }
  return Math.abs(polygonArea(poly));
}
