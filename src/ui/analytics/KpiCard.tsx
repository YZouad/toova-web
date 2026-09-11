import { deltaTone, formatCompact, formatDelta } from './chartMath';

export function KpiCard({
  label,
  value,
  previous,
  deltaPct,
  scope,
  unavailable,
}: {
  label: string;
  value: number;
  previous?: number;
  deltaPct?: number | null;
  scope?: string;
  unavailable?: boolean;
}) {
  const tone = deltaTone(deltaPct);
  return (
    <div className="analytics-kpi">
      <div className="analytics-kpi__label">{label}</div>
      <div className="analytics-kpi__value">
        {unavailable ? 'n/a' : formatCompact(value)}
      </div>
      <div className={`analytics-kpi__delta analytics-kpi__delta--${tone}`}>
        {unavailable ? 'Not instrumented yet' : `${formatDelta(deltaPct)} vs prior`}
      </div>
      {scope ? <div className="analytics-kpi__scope">{scope}</div> : null}
      {!unavailable && previous != null ? (
        <div className="analytics-kpi__prev">prev {formatCompact(previous)}</div>
      ) : null}
    </div>
  );
}
