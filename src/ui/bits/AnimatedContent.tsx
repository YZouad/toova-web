import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

export interface AnimatedContentProps {
  /** Unique key — remounts content with a fade/rise when it changes. */
  contentKey: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Slight vertical rise on enter (default 8px). */
  rise?: number;
}

/** Fade-and-rise panel switch inspired by React Bits Animated Content. */
export function AnimatedContent({
  contentKey,
  children,
  className,
  style,
  rise = 8,
}: AnimatedContentProps) {
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={contentKey}
        className={className}
        style={style}
        initial={{ opacity: 0, y: rise }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -rise * 0.5 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
