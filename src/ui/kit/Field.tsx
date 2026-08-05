import type { CSSProperties, ReactNode } from 'react';

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
  style,
}: FieldProps) {
  return (
    <div className={['kit-field', className].filter(Boolean).join(' ')} style={style}>
      {label ? (
        <label htmlFor={htmlFor} className="kit-field__label">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <div className="kit-field__error">{error}</div>
      ) : hint ? (
        <div className="kit-field__hint">{hint}</div>
      ) : null}
    </div>
  );
}
