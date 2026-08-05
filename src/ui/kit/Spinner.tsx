import type { CSSProperties } from 'react';

export interface SpinnerProps {
  size?: number;
  label?: string;
  inline?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Spinner({
  size = 16,
  label,
  inline = false,
  className,
  style,
}: SpinnerProps) {
  const ring = (
    <span
      className="kit-spinner__ring"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );

  if (!label) {
    return (
      <span className={['kit-spinner', className].filter(Boolean).join(' ')} style={style}>
        {ring}
      </span>
    );
  }

  return (
    <span
      className={[
        'kit-spinner',
        inline ? 'kit-spinner--inline' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      role="status"
    >
      {ring}
      <span className="kit-spinner__label">{label}</span>
    </span>
  );
}
