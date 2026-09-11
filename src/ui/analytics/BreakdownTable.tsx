import { RuledTable } from '../kit';
import { formatCompact } from './chartMath';

export interface BreakdownRow {
  key: string;
  label: string;
  value: number;
  share?: number;
}

export function BreakdownTable({
  title,
  description,
  emptyHint,
  dimensionLabel = 'Name',
  valueLabel = 'Count',
  rows,
  onRowClick,
}: {
  title: string;
  description?: string;
  emptyHint?: string;
  dimensionLabel?: string;
  valueLabel?: string;
  rows: BreakdownRow[];
  onRowClick?: (row: BreakdownRow) => void;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="analytics-breakdown">
      <h3 className="analytics-breakdown__title">{title}</h3>
      {description ? <p className="analytics-chart__desc">{description}</p> : null}
      {rows.length === 0 ? (
        <p className="analytics-chart__empty">{emptyHint ?? 'Nothing in this breakdown yet.'}</p>
      ) : (
        <RuledTable
          columns={[
            { label: dimensionLabel, align: 'left', sortKey: 'label' },
            { label: valueLabel, align: 'right', sortKey: 'value' },
            { label: 'Share of total', align: 'right' },
          ]}
          rows={rows.map((row) => {
            const share = row.share ?? (total ? row.value / total : 0);
            const sharePct = Math.round(share * 1000) / 10;
            return [
              onRowClick ? (
                <button
                  key={`${row.key}-label`}
                  type="button"
                  className="analytics-linkish"
                  onClick={() => onRowClick(row)}
                >
                  {row.label}
                </button>
              ) : (
                row.label
              ),
              <span key={`${row.key}-value`} className="analytics-breakdown__count">
                <span
                  className="analytics-breakdown__bar"
                  style={{ width: `${Math.max(share > 0 ? 6 : 0, Math.round(share * 100))}%` }}
                  aria-hidden
                />
                {formatCompact(row.value)}
              </span>,
              `${sharePct}%`,
            ];
          })}
        />
      )}
      {rows.length > 0 ? (
        <p className="analytics-breakdown__total">{formatCompact(total)} total</p>
      ) : null}
    </div>
  );
}
