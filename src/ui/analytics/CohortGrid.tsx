import { formatCompact } from './chartMath';

export interface CohortRow {
  cohort: string;
  size: number;
  d1: number;
  d7: number;
  d30: number;
}

function pct(part: number, size: number): number {
  if (!size) return 0;
  return Math.round((part / size) * 100);
}

function formatCohortWeek(raw: string): string {
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return raw;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(t));
}

export function CohortGrid({
  rows,
  title = 'Signup retention',
  description = 'Share of each week’s new accounts who had any recorded event within 1, 7, or 30 days of signing up.',
  columns = {
    size: 'New accounts',
    d1: 'Still active after 1 day',
    d7: 'After 7 days',
    d30: 'After 30 days',
  },
}: {
  rows: CohortRow[];
  title?: string;
  description?: string;
  columns?: { size: string; d1: string; d7: string; d30: string };
}) {
  if (rows.length === 0) {
    return (
      <figure className="analytics-chart">
        <figcaption className="analytics-chart__title">{title}</figcaption>
        <p className="analytics-chart__desc">{description}</p>
        <p className="analytics-chart__empty">No signup cohorts in this window.</p>
      </figure>
    );
  }
  return (
    <figure className="analytics-chart analytics-cohort-card">
      <figcaption className="analytics-chart__title">{title}</figcaption>
      <p className="analytics-chart__desc">{description}</p>
      <div className="analytics-cohort-wrap">
        <table className="analytics-cohort">
          <caption className="sr-only">{title}: retention columns</caption>
          <thead>
            <tr>
              <th scope="col">Signed up week of</th>
              <th scope="col">{columns.size}</th>
              <th scope="col">{columns.d1}</th>
              <th scope="col">{columns.d7}</th>
              <th scope="col">{columns.d30}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.cohort}>
                <th scope="row">{formatCohortWeek(row.cohort)}</th>
                <td>{formatCompact(row.size)}</td>
                {(['d1', 'd7', 'd30'] as const).map((key) => {
                  const retained = row[key];
                  const value = pct(retained, row.size);
                  return (
                    <td key={key}>
                      <span
                        className="analytics-cohort__cell"
                        style={{ background: `rgba(126, 138, 96, ${Math.min(0.85, value / 100)})` }}
                      >
                        <strong>{value}%</strong>
                        <small>
                          {formatCompact(retained)} of {formatCompact(row.size)}
                        </small>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
