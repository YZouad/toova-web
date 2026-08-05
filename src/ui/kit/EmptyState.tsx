import type { CSSProperties, ReactNode } from 'react';

export interface EmptyStateProps {
  label?: string;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function EmptyState({
  label = 'Empty',
  title,
  body,
  action,
  className,
  style,
}: EmptyStateProps) {
  return (
    <div className={['kit-empty-state', className].filter(Boolean).join(' ')} style={style}>
      <div className="kit-empty-state__label">{label}</div>
      <div className="kit-empty-state__title">{title}</div>
      {body ? <p className="kit-empty-state__body">{body}</p> : null}
      {action}
    </div>
  );
}
