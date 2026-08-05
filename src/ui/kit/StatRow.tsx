import type { CSSProperties } from 'react';
import { MonoMeta } from './MonoMeta';

export interface StatRowProps {
  items: string[];
  inverse?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function StatRow({ items, inverse = false, className, style }: StatRowProps) {
  return (
    <div className={['kit-stat-row', className].filter(Boolean).join(' ')} style={style}>
      {items.map((item) => (
        <MonoMeta
          key={item}
          size="sm"
          upper
          tone="subtle"
          className={inverse ? 'kit-mono-meta--inverse' : ''}
        >
          {item}
        </MonoMeta>
      ))}
    </div>
  );
}
