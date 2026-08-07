import type { CSSProperties, ReactNode } from 'react';
import { Logo } from './Logo';

export interface SplashProps {
  label: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Full-viewport boot screen with the square brand mark. */
export function Splash({ label, className, style }: SplashProps) {
  return (
    <div
      className={['splash-page', className].filter(Boolean).join(' ')}
      style={style}
      role="status"
    >
      <div className="splash-inner">
        <Logo size={48} wordmark={false} />
        <div className="splash-inner__label">{label}</div>
      </div>
    </div>
  );
}
