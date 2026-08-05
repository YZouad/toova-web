import type { CSSProperties } from 'react';

export interface RuledListItem {
  index?: string;
  label: React.ReactNode;
  meta?: React.ReactNode;
}

export interface RuledListProps {
  items: RuledListItem[];
  columns?: 1 | 2;
  inverse?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function RuledList({
  items,
  columns = 1,
  inverse = false,
  className,
  style,
}: RuledListProps) {
  const perCol = Math.ceil(items.length / Math.max(1, columns));

  return (
    <div
      className={[
        'kit-ruled-list',
        columns === 2 ? 'kit-ruled-list--two-col' : '',
        inverse ? 'kit-ruled-list--inverse' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        columns > 1
          ? ({ ...style, '--ruled-rows': String(perCol) } as CSSProperties)
          : style
      }
    >
      {items.map((item, i) => {
        const col = columns > 1 ? Math.floor(i / perCol) + 1 : 1;
        const row = columns > 1 ? (i % perCol) + 1 : undefined;
        const lastInCol = i % perCol === perCol - 1 || i === items.length - 1;
        return (
          <div
            key={`${item.index ?? ''}-${String(item.label)}`}
            className={[
              'kit-ruled-list__row',
              lastInCol ? 'kit-ruled-list__row--last-in-col' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={
              columns > 1
                ? { gridColumn: col, gridRow: row }
                : undefined
            }
          >
            {item.index ? (
              <span className="kit-ruled-list__index">{item.index}</span>
            ) : null}
            <span className="kit-ruled-list__label">{item.label}</span>
            {item.meta ? (
              <span className="kit-ruled-list__meta">{item.meta}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
