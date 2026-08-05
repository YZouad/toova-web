import type { ReactNode } from 'react';

interface GalleryShelfProps {
  title: string;
  seeAllHref?: string | null;
  onSeeAll?: () => void;
  children: ReactNode;
  empty?: boolean;
}

export function GalleryShelf({
  title,
  seeAllHref,
  onSeeAll,
  children,
  empty,
}: GalleryShelfProps) {
  if (empty) return null;

  return (
    <section className="gallery-shelf-section">
      <div className="gallery-shelf-header">
        <h2 className="gallery-shelf-title">{title}</h2>
        {onSeeAll || seeAllHref ? (
          <button
            type="button"
            className="gallery-shelf-see-all"
            onClick={() => {
              if (onSeeAll) onSeeAll();
              else if (seeAllHref) window.location.assign(seeAllHref);
            }}
          >
            See all →
          </button>
        ) : null}
      </div>
      <div className="gallery-shelf tv-scroll">{children}</div>
    </section>
  );
}
