import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export type MonoMetaSize = 'lg' | 'md' | 'sm' | 'xs';
export type MonoMetaTone = 'default' | 'subtle' | 'dense';

export interface MonoMetaProps extends HTMLAttributes<HTMLSpanElement> {
  size?: MonoMetaSize;
  tone?: MonoMetaTone;
  upper?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function MonoMeta({
  size = 'md',
  tone = 'default',
  upper = false,
  children,
  className,
  style,
  ...rest
}: MonoMetaProps) {
  const classes = [
    'kit-mono-meta',
    `kit-mono-meta--${size}`,
    `kit-mono-meta--${tone}`,
    upper ? 'kit-mono-meta--upper' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} style={style} {...rest}>
      {children}
    </span>
  );
}
