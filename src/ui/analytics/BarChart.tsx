import { chartMax, type ChartPoint } from './chartMath';

export function BarChart({
  title,
  description,
  emptyHint,
  points,
}: {
  title: string;
  description?: string;
  emptyHint?: string;
  points: Array<ChartPoint & { label?: string }>;
}) {
  const max = chartMax(points.map((p) => p.v));
  const empty = points.length === 0;
  return (
    <figure className="analytics-chart">
      <figcaption className="analytics-chart__title">{title}</figcaption>
      {description ? <p className="analytics-chart__desc">{description}</p> : null}
      {empty ? (
        <p className="analytics-chart__empty">{emptyHint ?? 'No breakdown yet.'}</p>
      ) : (
        <div className="analytics-bars" role="img" aria-label={title}>
          {points.map((p) => (
            <div key={p.t} className="analytics-bars__row">
              <div className="analytics-bars__label">{p.label ?? p.t}</div>
              <div className="analytics-bars__track">
                <div
                  className="analytics-bars__fill"
                  style={{ width: `${Math.max(2, Math.round((p.v / max) * 100))}%` }}
                />
              </div>
              <div className="analytics-bars__value">{p.v}</div>
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}
