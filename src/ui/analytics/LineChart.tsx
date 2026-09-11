import {
  chartMax,
  chartPointCoords,
  chartYTicks,
  formatChartTick,
  formatCompact,
  pickTickIndexes,
  polylinePoints,
  shouldLabelPoint,
  type ChartPoint,
} from './chartMath';

const WIDTH = 560;
const HEIGHT = 200;
const PAD = { left: 40, right: 18, top: 22, bottom: 32 };

export function LineChart({
  title,
  points,
  unit,
  description,
  emptyHint,
}: {
  title: string;
  points: ChartPoint[];
  unit?: string;
  description?: string;
  emptyHint?: string;
}) {
  const hasPoints = points.length > 0;
  const values = points.map((p) => p.v);
  const total = values.reduce((sum, v) => sum + v, 0);
  const peakIndex = values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
  const peak = hasPoints ? { v: values[peakIndex] ?? 0, i: peakIndex } : null;
  const latest = hasPoints ? points[points.length - 1] : undefined;
  const axisMax = chartMax(values);
  const yTicks = chartYTicks(axisMax, 4);
  const coords = chartPointCoords(points, WIDTH, HEIGHT, PAD);
  const line = polylinePoints(points, WIDTH, HEIGHT, PAD);
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area =
    first && last
      ? `${first.x.toFixed(1)},${(HEIGHT - PAD.bottom).toFixed(1)} ${line} ${last.x.toFixed(1)},${(HEIGHT - PAD.bottom).toFixed(1)}`
      : '';
  const xTicks = pickTickIndexes(points.length, points.length > 16 ? 5 : 6);
  const labeled = coords.filter((p, i) => shouldLabelPoint(points, i));
  const shownLabels: typeof labeled = [];
  const lastLabeled = labeled[labeled.length - 1];
  for (const p of labeled) {
    const prev = shownLabels[shownLabels.length - 1];
    if (prev && Math.abs(p.x - prev.x) < 36 && p !== lastLabeled) continue;
    shownLabels.push(p);
  }
  if (lastLabeled && shownLabels[shownLabels.length - 1] !== lastLabeled) {
    shownLabels.push(lastLabeled);
  }

  return (
    <figure className="analytics-chart">
      <figcaption className="analytics-chart__head">
        <span className="analytics-chart__title">
          {title}
          {unit ? <span className="analytics-chart__unit">{unit}</span> : null}
        </span>
        {hasPoints ? (
          <span className="analytics-chart__stats">
            <span>{formatCompact(total)} total</span>
            {peak ? (
              <span>
                peak {formatCompact(peak.v)} on {formatChartTick(String(points[peak.i]?.t ?? ''))}
              </span>
            ) : null}
            {latest ? (
              <span>
                latest {formatCompact(latest.v)} on {formatChartTick(String(latest.t))}
              </span>
            ) : null}
          </span>
        ) : null}
      </figcaption>
      {description ? <p className="analytics-chart__desc">{description}</p> : null}
      {!hasPoints ? (
        <p className="analytics-chart__empty">{emptyHint ?? 'No data in this range yet.'}</p>
      ) : (
        <svg
          className="analytics-chart__svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${title}: ${formatCompact(total)} ${unit ?? ''} total, peak ${formatCompact(peak?.v ?? 0)}`}
        >
          {yTicks.map((tick) => {
            const y = PAD.top + ((HEIGHT - PAD.top - PAD.bottom) * (1 - tick / axisMax));
            return (
              <g key={`y-${tick}`}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={y}
                  y2={y}
                  className="analytics-chart__grid"
                />
                <text
                  x={PAD.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="analytics-chart__tick"
                  fontSize="11"
                >
                  {formatCompact(tick)}
                </text>
              </g>
            );
          })}
          {area ? <polygon className="analytics-chart__area" points={area} /> : null}
          <polyline className="analytics-chart__line" fill="none" points={line} />
          {shownLabels.map((p) => (
            <g key={`pt-${p.t}`}>
              <circle cx={p.x} cy={p.y} r="3.2" className="analytics-chart__dot" />
              <text
                x={p.x}
                y={p.y - 8}
                textAnchor="middle"
                className="analytics-chart__value"
                fontSize="11"
              >
                {formatCompact(p.v)}
              </text>
            </g>
          ))}
          {xTicks.map((index) => {
            const p = coords[index];
            if (!p) return null;
            const anchor = index === 0 ? 'start' : index === coords.length - 1 ? 'end' : 'middle';
            return (
              <text
                key={`x-${p.t}`}
                x={p.x}
                y={HEIGHT - 8}
                textAnchor={anchor}
                className="analytics-chart__tick"
                fontSize="11"
              >
                {formatChartTick(String(p.t))}
              </text>
            );
          })}
        </svg>
      )}
      <table className="analytics-chart__table">
        <caption className="sr-only">{title} tabular summary</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">{unit ?? 'Value'}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.t}>
              <td>{formatChartTick(String(p.t))}</td>
              <td>{p.v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
