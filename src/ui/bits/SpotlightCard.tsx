import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

export interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'article' | 'section';
  onClick?: () => void;
  role?: string;
  tabIndex?: number;
}

/**
 * Cursor spotlight card inspired by React Bits Spotlight Card.
 * Sets --spot-x/--spot-y on the host; glow is a ::before so children stay
 * direct descendants (safe for CSS grid rows).
 */
export function SpotlightCard({
  children,
  className = '',
  style,
  as: Tag = 'div',
  onClick,
  role,
  tabIndex,
}: SpotlightCardProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();

  const handleMove = (e: React.PointerEvent<HTMLElement>) => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
    el.dataset.spotActive = 'true';
  };

  const handleLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.dataset.spotActive = 'false';
    el.style.removeProperty('--spot-x');
    el.style.removeProperty('--spot-y');
  };

  const handleKeyDown =
    onClick && (role === 'button' || tabIndex != null)
      ? (e: KeyboardEvent<HTMLElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }
      : undefined;

  return (
    <Tag
      ref={ref as never}
      className={['bits-spotlight', className].filter(Boolean).join(' ')}
      style={style}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={role}
      tabIndex={tabIndex}
    >
      {children}
    </Tag>
  );
}
