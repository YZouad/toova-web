import type { CSSProperties, ReactNode } from 'react';

export interface RuledTableColumn {
  label: string;
  align?: 'left' | 'right' | 'center';
  /** When set with onSort, header becomes a sort control. */
  sortKey?: string;
}

export interface RuledTableProps {
  columns: RuledTableColumn[];
  rows: (string | ReactNode)[][];
  zebra?: boolean;
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  className?: string;
  style?: CSSProperties;
}

export function RuledTable({
  columns,
  rows,
  zebra = false,
  sortKey = null,
  sortDir = 'asc',
  onSort,
  className,
  style,
}: RuledTableProps) {
  return (
    <table className={['kit-ruled-table', className].filter(Boolean).join(' ')} style={style}>
      <thead>
        <tr>
          {columns.map((column, i) => {
            const align = column.align ?? (i === 0 ? 'left' : 'right');
            const sortable = Boolean(column.sortKey && onSort);
            const active = sortable && sortKey === column.sortKey;
            const marker = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

            if (!sortable) {
              return (
                <th
                  key={column.label}
                  className="kit-ruled-table__head"
                  style={{ textAlign: align }}
                >
                  {column.label}
                </th>
              );
            }

            return (
              <th
                key={column.label}
                className="kit-ruled-table__head"
                style={{ textAlign: align }}
              >
                <button
                  type="button"
                  className={[
                    'kit-ruled-table__sort',
                    active ? 'kit-ruled-table__sort--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSort?.(column.sortKey!)}
                  aria-sort={
                    active
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  {column.label}
                  {marker}
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr
            key={rowIndex}
            className={zebra && rowIndex % 2 ? 'kit-ruled-table__row--zebra' : ''}
          >
            {row.map((cell, cellIndex) => (
              <td
                key={cellIndex}
                className={[
                  'kit-ruled-table__cell',
                  cellIndex === 0 ? 'kit-ruled-table__cell--primary' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  textAlign:
                    columns[cellIndex]?.align ?? (cellIndex === 0 ? 'left' : 'right'),
                }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
