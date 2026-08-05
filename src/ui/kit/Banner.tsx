import type { CSSProperties, ReactNode } from 'react';

export type BannerTone = 'error' | 'success' | 'info';

export interface BannerProps {
  tone?: BannerTone;
  label?: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_LABELS: Record<BannerTone, string> = {
  error: 'ERROR',
  success: 'DONE',
  info: 'NOTE',
};

export function Banner({
  tone = 'info',
  label,
  children,
  className,
  style,
}: BannerProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={['kit-banner', `kit-banner--${tone}`, className].filter(Boolean).join(' ')}
      style={style}
    >
      <span className="kit-banner__label">{label ?? DEFAULT_LABELS[tone]}</span>
      <span className="kit-banner__body">{children}</span>
    </div>
  );
}
