import type { CSSProperties, HTMLAttributes } from 'react';

export type RuleWeight = 'heavy' | 'hair' | 'soft';

export interface RuleProps extends HTMLAttributes<HTMLDivElement> {
  weight?: RuleWeight;
  spacing?: number;
  vertical?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Rule({
  weight = 'hair',
  spacing = 0,
  vertical = false,
  className,
  style,
  ...rest
}: RuleProps) {
  const classes = [
    'kit-rule',
    `kit-rule--${weight}`,
    vertical ? 'kit-rule--vertical' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="separator"
      className={classes}
      style={
        {
          ...style,
          '--kit-rule-spacing': `${spacing}px`,
        } as CSSProperties
      }
      {...rest}
    />
  );
}
