import { formatCompact } from './chartMath';

export interface FunnelStep {
  key: string;
  label: string;
  value: number;
  unavailable?: boolean;
  hint?: string;
}

function relationToPrior(current: number, previous: number): string {
  if (previous <= 0 && current <= 0) return 'No activity at this or the previous step';
  if (previous <= 0) return 'No previous-step volume to compare';
  if (current === 0) return 'Nobody continued from the previous step';
  const pct = Math.round((current / previous) * 1000) / 10;
  if (pct > 100) {
    return `${formatCompact(current)} vs ${formatCompact(previous)} previous — not a strict drop-off`;
  }
  if (pct === 100) return 'Same volume as the previous step';
  const dropped = previous - current;
  return `${pct}% of previous step continued · ${formatCompact(dropped)} dropped off`;
}

export function FunnelChart({
  title,
  description,
  steps,
}: {
  title: string;
  description?: string;
  steps: FunnelStep[];
}) {
  const max = Math.max(1, ...steps.map((s) => (s.unavailable ? 0 : s.value)));
  const baseline = steps.find((s) => !s.unavailable && s.value > 0);
  return (
    <figure className="analytics-chart">
      <figcaption className="analytics-chart__title">{title}</figcaption>
      {description ? <p className="analytics-chart__desc">{description}</p> : null}
      <ol className="analytics-funnel">
        {steps.map((step, i) => {
          const prev = i === 0 ? step.value : steps[i - 1]?.value ?? step.value;
          const widthPct = step.unavailable || step.value <= 0 ? 0 : Math.round((step.value / max) * 100);
          const ofFirst =
            baseline && !step.unavailable
              ? Math.round((step.value / baseline.value) * 1000) / 10
              : null;
          return (
            <li key={step.key} className="analytics-funnel__step">
              <div className="analytics-funnel__meta">
                <div>
                  <strong>{step.label}</strong>
                  {step.hint ? <p className="analytics-funnel__hint">{step.hint}</p> : null}
                </div>
                <span className="analytics-funnel__value">
                  {step.unavailable ? 'n/a' : formatCompact(step.value)}
                </span>
              </div>
              <div className="analytics-funnel__track" aria-hidden>
                <div className="analytics-funnel__fill" style={{ width: `${widthPct}%` }} />
              </div>
              <p className="analytics-funnel__conv">
                {step.unavailable
                  ? 'Not instrumented yet'
                  : i === 0
                    ? step.value > 0
                      ? 'Starting step of this funnel'
                      : 'No volume in this range'
                    : relationToPrior(step.value, prev)}
                {i > 0 && ofFirst != null && !step.unavailable
                  ? ` · ${ofFirst}% of ${baseline?.label.toLowerCase()}`
                  : ''}
              </p>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
