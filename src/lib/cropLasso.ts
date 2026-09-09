import type { NaturalPoint } from './cropPixels';

export function clampNaturalPoint(
  point: NaturalPoint,
  width: number,
  height: number,
): NaturalPoint {
  return {
    x: Math.max(0, Math.min(point.x, Math.max(0, width - 1))),
    y: Math.max(0, Math.min(point.y, Math.max(0, height - 1))),
  };
}

/** Skip points that are closer than `minDistance` to the last sample. */
export function appendLassoPoint(
  points: NaturalPoint[],
  next: NaturalPoint,
  minDistance: number,
): NaturalPoint[] {
  const last = points[points.length - 1];
  if (!last) return [{ ...next }];
  if (Math.hypot(next.x - last.x, next.y - last.y) < minDistance) return points;
  return [...points, { ...next }];
}

/** ~2 display pixels in natural image space, so a drag stays smooth without thousands of vertices. */
export function lassoSampleDistance(naturalWidth: number, contentWidth: number): number {
  const naturalPerDisplay = naturalWidth / Math.max(1, contentWidth);
  return Math.max(2, naturalPerDisplay * 2);
}

function pointSegmentDistance(point: NaturalPoint, a: NaturalPoint, b: NaturalPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker simplification. */
export function simplifyPolyline(points: NaturalPoint[], epsilon: number): NaturalPoint[] {
  if (points.length <= 2 || epsilon <= 0) {
    return points.map((point) => ({ ...point }));
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;
  let maxDist = 0;
  let maxIndex = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const dist = pointSegmentDistance(points[i]!, first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPolyline(points.slice(0, maxIndex + 1), epsilon);
    const right = simplifyPolyline(points.slice(maxIndex), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [{ ...first }, { ...last }];
}

/**
 * Close a freehand stroke into a crop polygon. Returns null when the stroke is
 * too small to mask.
 */
export function finalizeLassoPath(
  points: NaturalPoint[],
  epsilon: number,
): NaturalPoint[] | null {
  if (points.length < 3) return null;

  const simplified = simplifyPolyline(points, epsilon);
  const result = simplified.length >= 3 ? simplified : points.map((point) => ({ ...point }));
  if (result.length < 3) return null;

  const first = result[0]!;
  const last = result[result.length - 1]!;
  if (Math.hypot(first.x - last.x, first.y - last.y) < Math.max(1, epsilon)) {
    const open = result.slice(0, -1);
    return open.length >= 3 ? open : result;
  }

  return result;
}
