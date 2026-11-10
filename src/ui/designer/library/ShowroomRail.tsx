import { useRef, type ReactNode } from 'react';

export function ShowroomRail({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  return (
    <section className="dgl-rail">
      <div className="dgl-rail__head">
        <h3 className="dgl-rail__title">{title}</h3>
        <div className="dgl-rail__nav">
          <button
            type="button"
            className="dgl-rail__arrow"
            aria-label="Scroll left"
            onClick={() => scrollBy(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="dgl-rail__arrow"
            aria-label="Scroll right"
            onClick={() => scrollBy(1)}
          >
            ›
          </button>
        </div>
      </div>
      <div className="dgl-rail__fade">
        <div className="dgl-rail__track" role="list" ref={trackRef}>
          {children}
        </div>
      </div>
    </section>
  );
}
