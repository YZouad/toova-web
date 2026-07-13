import { useRef, type ReactNode } from 'react';

interface FpSpotlightCardProps {
  children: ReactNode;
  className?: string;
}

export function FpSpotlightCard({ children, className = '' }: FpSpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty('--fp-spot-x', `${x}px`);
    el.style.setProperty('--fp-spot-y', `${y}px`);
  };

  return (
    <div
      ref={ref}
      className={`fp-card ${className}`.trim()}
      onPointerMove={handleMove}
      onPointerLeave={() => {
        ref.current?.style.removeProperty('--fp-spot-x');
        ref.current?.style.removeProperty('--fp-spot-y');
      }}
    >
      {children}
    </div>
  );
}
