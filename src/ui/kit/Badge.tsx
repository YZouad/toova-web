import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export type BadgeTone = 'accent' | 'neutral' | 'danger' | 'success';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
  className,
  style,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={['kit-badge', `kit-badge--${tone}`, className].filter(Boolean).join(' ')}
      style={style}
      {...rest}
    >
      {dot ? <span className="kit-badge__dot" aria-hidden /> : null}
      {children}
    </span>
  );
}
