import { useId, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

export interface TabItem {
  id: string;
  label: string;
  count?: number | string;
}

export interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  style?: CSSProperties;
  /** Sliding layoutId underline (React Bits–style). Opt-in so other callers stay unchanged. */
  animated?: boolean;
  /** Shared layoutId for the underline; defaults to a generated id. */
  layoutId?: string;
  'aria-label'?: string;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
  style,
  animated = false,
  layoutId,
  'aria-label': ariaLabel,
}: TabsProps) {
  const reduced = usePrefersReducedMotion();
  const autoId = useId();
  const underlineId = layoutId ?? `kit-tabs-underline-${autoId}`;
  const listRef = useRef<HTMLDivElement>(null);
  const showMotion = animated && !reduced;

  function focusTabAt(index: number) {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[index]?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const ids = tabs.map((t) => t.id);
    const idx = ids.indexOf(active);
    if (idx < 0) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      next = (idx + 1) % ids.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      next = (idx - 1 + ids.length) % ids.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      next = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      next = ids.length - 1;
    } else {
      return;
    }
    onChange(ids[next]!);
    focusTabAt(next);
  }

  return (
    <div
      ref={listRef}
      className={['kit-tabs', animated ? 'kit-tabs--animated' : '', className]
        .filter(Boolean)
        .join(' ')}
      style={style}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            className={[
              'kit-tabs__tab',
              isActive ? 'kit-tabs__tab--active' : '',
              animated ? 'kit-tabs__tab--animated' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.count != null ? (
              <span className="kit-tabs__count">{tab.count}</span>
            ) : null}
            {showMotion && isActive ? (
              <motion.span
                className="kit-tabs__underline"
                layoutId={underlineId}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                aria-hidden
              />
            ) : null}
            {!showMotion && animated && isActive ? (
              <span className="kit-tabs__underline" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
