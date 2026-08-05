import type { CSSProperties, ReactNode } from 'react';

export interface KeyValueRowProps {
  label: ReactNode;
  value: ReactNode;
  inverse?: boolean;
  valueTone?: 'default' | 'accent';
  last?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function KeyValueRow({
  label,
  value,
  inverse = false,
  valueTone = 'default',
  last = false,
  className,
  style,
}: KeyValueRowProps) {
  return (
    <div
      className={[
        'kit-kv-row',
        inverse ? 'kit-kv-row--inverse' : '',
        last ? 'kit-kv-row--last' : '',
        valueTone === 'accent' ? 'kit-kv-row--accent-value' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <span className="kit-kv-row__label">{label}</span>
      <span className="kit-kv-row__value">{value}</span>
    </div>
  );
}
