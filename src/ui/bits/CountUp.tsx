import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

export interface CountUpProps {
  value: number;
  durationMs?: number;
  className?: string;
}

/** Animated integer count-up inspired by React Bits Count Up. */
export function CountUp({ value, durationMs = 700, className }: CountUpProps) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const fromRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(from + (value - from) * eased);
      setDisplay(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, durationMs, reduced]);

  return (
    <span className={className} aria-label={String(value)}>
      {display}
    </span>
  );
}
