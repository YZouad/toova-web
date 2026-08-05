import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';

export type DisplayLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface DisplayHeadingProps extends HTMLAttributes<HTMLElement> {
  level?: DisplayLevel;
  as?: ElementType;
  inverse?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

function defaultTag(level: DisplayLevel): ElementType {
  return level <= 2 ? 'h1' : 'h2';
}

export function DisplayHeading({
  level = 1,
  as,
  inverse = false,
  children,
  className,
  style,
  ...rest
}: DisplayHeadingProps) {
  const Tag = as ?? defaultTag(level);
  const classes = [
    'kit-display-heading',
    `kit-display-heading--${level}`,
    inverse ? 'kit-display-heading--inverse' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag className={classes} style={style} {...rest}>
      {children}
    </Tag>
  );
}

export interface DisplayEmProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function DisplayEm({ children, className, style }: DisplayEmProps) {
  return (
    <span className={['kit-display-em', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </span>
  );
}
