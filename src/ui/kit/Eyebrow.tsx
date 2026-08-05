import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export type EyebrowLevel = 'page' | 'section';
export type EyebrowTone = 'default' | 'inverse';

export interface EyebrowProps extends HTMLAttributes<HTMLDivElement> {
  level?: EyebrowLevel;
  tone?: EyebrowTone;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Eyebrow({
  level = 'section',
  tone = 'default',
  children,
  className,
  style,
  ...rest
}: EyebrowProps) {
  const classes = [
    'kit-eyebrow',
    `kit-eyebrow--${level}`,
    `kit-eyebrow--${tone}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={style} {...rest}>
      {children}
    </div>
  );
}
