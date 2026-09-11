export interface ChartPoint {
  t: string;
  v: number;
}

export function chartMax(values: number[], fallback = 1): number {
  const max = Math.max(0, ...values);
  if (!Number.isFinite(max) || max <= 0) return fallback;
  const mag = 10 ** Math.floor(Math.log10(max));
  const nice = Math.ceil(max / mag) * mag;
  return nice > 0 ? nice : fallback;
}

export function formatChartTick(isoOrDate: string): string {
  const raw = String(isoOrDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [, m, d] = raw.split('-');
    return `${Number(m)}/${Number(d)}`;
  }
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return raw.slice(0, 10);
  const d = new Date(t);
  if (raw.includes('T') && raw.includes(':')) {
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:00`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export type ChartInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export function resolveChartPad(pad: number | Partial<ChartInsets> = 8): ChartInsets {
  if (typeof pad === 'number') {
    return { left: pad, right: pad, top: pad, bottom: pad };
  }
  return {
    left: pad.left ?? 8,
    right: pad.right ?? 8,
    top: pad.top ?? 8,
    bottom: pad.bottom ?? 8,
  };
}

export function chartYTicks(max: number, count = 4): number[] {
  const nice = chartMax([max]);
  const steps = Math.max(2, count) - 1;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => {
    const v = (nice / steps) * i;
    return nice <= 20 ? Math.round(v * 10) / 10 : Math.round(v);
  });
  return [...new Set(ticks)];
}

export function pickTickIndexes(length: number, maxTicks = 5): number[] {
  if (length <= 0) return [];
  if (length === 1) return [0];
  const ticks = Math.min(maxTicks, length);
  const last = length - 1;
  const set = new Set<number>();
  for (let i = 0; i < ticks; i++) {
    set.add(Math.round((i / (ticks - 1)) * last));
  }
  return [...set].sort((a, b) => a - b);
}

export function shouldLabelPoint(points: ChartPoint[], index: number): boolean {
  const point = points[index];
  if (!point) return false;
  if (points.length <= 8) return point.v > 0 || index === points.length - 1;
  if (index === 0 || index === points.length - 1) return point.v > 0 || index === points.length - 1;
  const prev = points[index - 1]?.v ?? 0;
  const next = points[index + 1]?.v ?? 0;
  return point.v > 0 && point.v >= prev && point.v >= next && (point.v > prev || point.v > next);
}

export function chartPointCoords(
  points: ChartPoint[],
  width: number,
  height: number,
  pad: number | Partial<ChartInsets> = 8,
): Array<ChartPoint & { x: number; y: number }> {
  const inset = resolveChartPad(pad);
  const max = chartMax(points.map((p) => p.v));
  const innerW = Math.max(1, width - inset.left - inset.right);
  const innerH = Math.max(1, height - inset.top - inset.bottom);
  return points.map((p, i) => {
    const x = inset.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = inset.top + innerH - (p.v / max) * innerH;
    return { ...p, x, y };
  });
}

export function polylinePoints(
  points: ChartPoint[],
  width: number,
  height: number,
  pad: number | Partial<ChartInsets> = 8,
): string {
  return chartPointCoords(points, width, height, pad)
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
}

export function deltaTone(delta: number | null | undefined): 'up' | 'down' | 'flat' {
  if (delta == null || delta === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

export function formatDelta(delta: number | null | undefined): string {
  if (delta == null || !Number.isFinite(delta)) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}%`;
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}
