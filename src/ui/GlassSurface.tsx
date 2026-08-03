import { useRef, type CSSProperties, type ReactNode } from 'react';

interface GlassSurfaceProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Softer / thinner chrome for the always-on strip. */
  compact?: boolean;
  as?: 'div' | 'aside' | 'section';
  id?: string;
  role?: string;
  'aria-label'?: string;
}

/**
 * Frosted glass shell inspired by React Bits Glass Surface —
 * CSS backdrop blur + cursor spotlight (no WebGL, HUD-safe).
 */
export function GlassSurface({
  children,
  className = '',
  style,
  compact = false,
  as: Tag = 'div',
  id,
  role,
  'aria-label': ariaLabel,
}: GlassSurfaceProps) {
  const ref = useRef<HTMLElement>(null);

  const handleMove = (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--glass-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--glass-y', `${e.clientY - rect.top}px`);
  };

  return (
    <Tag
      ref={ref as never}
      id={id}
      role={role}
      aria-label={ariaLabel}
      className={`glass-surface${compact ? ' glass-surface--compact' : ''} ${className}`.trim()}
      style={style}
      onPointerMove={handleMove}
      onPointerLeave={() => {
        ref.current?.style.removeProperty('--glass-x');
        ref.current?.style.removeProperty('--glass-y');
      }}
    >
      <div className="glass-surface-shine" aria-hidden />
      <div className="glass-surface-body">{children}</div>
    </Tag>
  );
}
